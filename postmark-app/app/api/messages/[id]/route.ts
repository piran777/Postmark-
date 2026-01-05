import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { google } from "googleapis";

type Action = "markRead" | "markUnread" | "archive" | "unarchive";

function coerceLabelIds(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  return labels.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function applyLabelMutationToLabels(labels: unknown, mut: { add: string[]; remove: string[] }): string[] {
  const base = coerceLabelIds(labels);
  const removed = base.filter((l) => !mut.remove.includes(l));
  const set = new Set<string>(removed);
  for (const a of mut.add) set.add(a);
  return Array.from(set);
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function stripScripts(html: string) {
  // Defense-in-depth: UI renders in sandboxed iframe (no scripts allowed),
  // but remove scripts anyway.
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

function findMimeParts(payload: any, out: Array<{ mimeType: string; data: string }>) {
  if (!payload) return;
  const mimeType = payload.mimeType as string | undefined;
  const data = payload.body?.data as string | undefined;
  if (mimeType && data) out.push({ mimeType, data });
  const parts = payload.parts as any[] | undefined;
  if (Array.isArray(parts)) {
    for (const p of parts) findMimeParts(p, out);
  }
}

async function fetchGmailBody(opts: {
  providerMessageId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}): Promise<{ html: string | null; text: string | null }> {
  if (!opts.providerMessageId) return { html: null, text: null };
  if (!opts.accessToken && !opts.refreshToken) return { html: null, text: null };

  const oauth2Client = gmailAuth(opts.accessToken ?? undefined, opts.refreshToken ?? undefined);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.messages.get({
    userId: "me",
    id: opts.providerMessageId,
    format: "full",
  });

  const payload = res.data.payload;
  const found: Array<{ mimeType: string; data: string }> = [];
  findMimeParts(payload, found);

  const htmlPart = found.find((p) => p.mimeType === "text/html");
  const textPart = found.find((p) => p.mimeType === "text/plain");

  const html = htmlPart?.data ? stripScripts(decodeBase64Url(htmlPart.data)) : null;
  const text = textPart?.data ? decodeBase64Url(textPart.data) : null;
  return { html, text };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const includeBody =
    url.searchParams.get("includeBody") === "true" ||
    url.searchParams.get("body") === "true";
  const includeConversation =
    url.searchParams.get("includeConversation") === "true" ||
    url.searchParams.get("conversation") === "true";

  const msg = await prisma.message.findFirst({
    where: { id, userId: user.id },
    include: {
      emailAccount: {
        select: {
          id: true,
          provider: true,
          emailAddress: true,
        },
      },
    },
  });
  if (!msg) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  let body: { html: string | null; text: string | null } | null = null;
  let conversation:
    | null
    | {
        threadId: string;
        items: Array<{
          id: string;
          subject: string | null;
          fromAddress: string | null;
          toAddress: string | null;
          date: string | null;
          snippet: string | null;
          isRead: boolean;
          isArchived: boolean;
        }>;
      } = null;

  if (includeBody && msg.provider === "google") {
    try {
      const tokens = await prisma.emailAccount.findFirst({
        where: { id: msg.emailAccountId, userId: user.id },
        select: { accessToken: true, refreshToken: true },
      });
      body = await fetchGmailBody({
        providerMessageId: msg.providerMessageId,
        accessToken: tokens?.accessToken ?? null,
        refreshToken: tokens?.refreshToken ?? null,
      });
    } catch {
      body = { html: null, text: null };
    }
  }

  if (includeConversation && msg.threadId) {
    const items = await prisma.message.findMany({
      where: {
        userId: user.id,
        emailAccountId: msg.emailAccountId,
        threadId: msg.threadId,
      },
      orderBy: [
        { date: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        subject: true,
        fromAddress: true,
        toAddress: true,
        date: true,
        snippet: true,
        isRead: true,
        isArchived: true,
      },
    });

    conversation = {
      threadId: msg.threadId,
      items: items.map((m) => ({
        id: m.id,
        subject: m.subject,
        fromAddress: m.fromAddress,
        toAddress: m.toAddress,
        date: m.date ? m.date.toISOString() : null,
        snippet: m.snippet,
        isRead: m.isRead,
        isArchived: m.isArchived,
      })),
    };
  }

  return Response.json({
    item: {
      id: msg.id,
      provider: msg.provider,
      subject: msg.subject,
      fromAddress: msg.fromAddress,
      toAddress: msg.toAddress,
      date: msg.date,
      snippet: msg.snippet,
      isRead: msg.isRead,
      isArchived: msg.isArchived,
      labels: msg.labels,
      providerMessageId: msg.providerMessageId,
      threadId: msg.threadId,
      emailAccount: msg.emailAccount,
      body,
      conversation,
    },
  });
}

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
  const applyToThread = body?.applyToThread === true;

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

    // Gmail-like behavior: actions apply to the whole conversation (thread) when possible.
    if (applyToThread && msg.threadId) {
      await gmail.users.threads.modify({
        userId: "me",
        id: msg.threadId,
        requestBody: {
          addLabelIds: add,
          removeLabelIds: remove,
        },
      });

      const inThread = await prisma.message.findMany({
        where: {
          userId: user.id,
          emailAccountId: msg.emailAccountId,
          threadId: msg.threadId,
        },
        select: { id: true, labels: true },
      });

      const now = new Date();
      await prisma.$transaction(
        inThread.map((m) => {
          const labelIds = applyLabelMutationToLabels(m.labels, { add, remove });
          const isRead = !labelIds.includes("UNREAD");
          const isArchived = !labelIds.includes("INBOX");
          return prisma.message.update({
            where: { id: m.id },
            data: {
              isRead,
              isArchived,
              labels: labelIds,
              syncedAt: now,
            },
          });
        })
      );
    } else {
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

      await prisma.message.update({
        where: { id: msg.id },
        data: {
          isRead,
          isArchived,
          labels: labelIds,
          syncedAt: new Date(),
        },
      });
    }

    const updated = await prisma.message.findFirst({
      where: { id: msg.id, userId: user.id },
      select: {
        id: true,
        provider: true,
        subject: true,
        fromAddress: true,
        toAddress: true,
        date: true,
        isRead: true,
        isArchived: true,
        snippet: true,
      },
    });
    if (!updated) {
      return Response.json({ error: "Message action applied but local record missing." }, { status: 500 });
    }

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




