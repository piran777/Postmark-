import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { google } from "googleapis";

type Action = "markRead" | "markUnread" | "archive" | "unarchive";

function gmailAuth(accessToken?: string, refreshToken?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth env vars");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return oauth2Client;
}

function labelMutation(action: Action): { add: string[]; remove: string[] } {
  switch (action) {
    case "markRead":
      return { add: [], remove: ["UNREAD"] };
    case "markUnread":
      return { add: ["UNREAD"], remove: [] };
    case "archive":
      // Archive == remove from INBOX
      return { add: [], remove: ["INBOX"] };
    case "unarchive":
      return { add: ["INBOX"], remove: [] };
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as Action | undefined;

  if (
    action !== "markRead" &&
    action !== "markUnread" &&
    action !== "archive" &&
    action !== "unarchive"
  ) {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const msg = await prisma.message.findFirst({
    where: { id, userId: user.id },
  });
  if (!msg) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  const account = await prisma.emailAccount.findFirst({
    where: { id: msg.emailAccountId, userId: user.id },
  });
  if (!account || account.provider !== "google") {
    return Response.json(
      { error: "This message provider is not supported yet." },
      { status: 400 }
    );
  }

  if (!account.refreshToken && !account.accessToken) {
    return Response.json(
      { error: "Missing Google tokens; reconnect account." },
      { status: 400 }
    );
  }

  try {
    const oauth2Client = gmailAuth(
      account.accessToken ?? undefined,
      account.refreshToken ?? undefined
    );
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const { add, remove } = labelMutation(action);

    const modifyRes = await gmail.users.messages.modify({
      userId: "me",
      id: msg.providerMessageId,
      requestBody: {
        addLabelIds: add,
        removeLabelIds: remove,
      },
    });

    const labelIds = modifyRes.data.labelIds ?? [];
    const isRead = !labelIds.includes("UNREAD");
    const isArchived = !labelIds.includes("INBOX");

    const updated = await prisma.message.update({
      where: { id: msg.id },
      data: {
        isRead,
        isArchived,
        labels: labelIds,
        syncedAt: new Date(),
      },
    });

    return Response.json({
      item: {
        id: updated.id,
        provider: updated.provider,
        subject: updated.subject,
        fromAddress: updated.fromAddress,
        toAddress: updated.toAddress,
        date: updated.date,
        isRead: updated.isRead,
        isArchived: updated.isArchived,
        snippet: updated.snippet,
      },
    });
  } catch (error: any) {
    const msg = String(error?.message || "");
    const code = error?.code ?? error?.status ?? error?.response?.status;

    // Most common when user hasn't re-consented to gmail.modify yet
    if (
      code === 403 &&
      msg.toLowerCase().includes("insufficient authentication scopes")
    ) {
      return Response.json(
        {
          error:
            "Insufficient Gmail permissions. Disconnect/revoke and sign in again so Postmark can get gmail.modify scope.",
          detail: msg,
        },
        { status: 400 }
      );
    }

    if (code === 400 && msg.toLowerCase().includes("invalid_grant")) {
      return Response.json(
        {
          error:
            "Google token is invalid (invalid_grant). Disconnect Gmail, revoke the app in your Google Account, then sign in again.",
          detail: msg,
        },
        { status: 400 }
      );
    }

    console.error("Message action failed", error);
    return Response.json(
      { error: "Message action failed", detail: msg, code },
      { status: 500 }
    );
  }
}




