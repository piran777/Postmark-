import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { google } from "googleapis";

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

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the user + Gmail account
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      emailAccounts: {
        where: { provider: "google" },
      },
    },
  });

  if (!user || user.emailAccounts.length === 0) {
    return Response.json(
      { error: "No connected Google account" },
      { status: 400 }
    );
  }

  const account = user.emailAccounts[0];
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

    // List recent messages
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 10,
      labelIds: ["INBOX"],
    });

    const messages = listRes.data.messages || [];

    for (const msg of messages) {
      if (!msg.id) continue;
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });

      const headers = full.data.payload?.headers || [];
      const subject =
        headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
      const from =
        headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
      const to =
        headers.find((h) => h.name?.toLowerCase() === "to")?.value || "";
      const dateHeader =
        headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

      const isRead = !(
        full.data.labelIds?.includes("UNREAD") ?? false
      );

      await prisma.message.upsert({
        where: {
          provider_providerMessageId: {
            provider: "google",
            providerMessageId: msg.id,
          },
        },
        create: {
          userId: user.id,
          emailAccountId: account.id,
          provider: "google",
          providerMessageId: msg.id,
          threadId: full.data.threadId ?? null,
          subject,
          fromAddress: from,
          toAddress: to,
          date: dateHeader ? new Date(dateHeader) : null,
          snippet: full.data.snippet ?? null,
          labels: full.data.labelIds ?? [],
          isRead,
          isArchived: full.data.labelIds?.includes("INBOX") ? false : true,
        },
        update: {
          threadId: full.data.threadId ?? null,
          subject,
          fromAddress: from,
          toAddress: to,
          date: dateHeader ? new Date(dateHeader) : null,
          snippet: full.data.snippet ?? null,
          labels: full.data.labelIds ?? [],
          isRead,
          isArchived: full.data.labelIds?.includes("INBOX") ? false : true,
          syncedAt: new Date(),
        },
      });
    }

    return Response.json({ synced: messages.length });
  } catch (error: any) {
    const msg = String(error?.message || "");
    const code = error?.code ?? error?.status ?? error?.response?.status;

    // Common case when Google didn't grant Gmail scope
    if (code === 403 && msg.toLowerCase().includes("insufficient authentication scopes")) {
      return Response.json(
        {
          error:
            "Gmail permission not granted. In Google Cloud Console, add the gmail.readonly scope to your OAuth consent screen, then revoke the app in your Google Account and sign in again.",
          detail: msg,
          hasRefreshToken: Boolean(account.refreshToken),
          storedAccountScope: account.scope ?? null,
        },
        { status: 400 }
      );
    }

    // Refresh token revoked / invalid / mismatch client credentials
    if (code === 400 && msg.toLowerCase().includes("invalid_grant")) {
      return Response.json(
        {
          error:
            "Google token is invalid (invalid_grant). Disconnect Gmail, revoke the app in your Google Account, then sign in again to get a fresh refresh token. Also confirm GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET match the same Google Cloud project that issued the token.",
          detail: msg,
          hasRefreshToken: Boolean(account.refreshToken),
          storedAccountScope: account.scope ?? null,
        },
        { status: 400 }
      );
    }

    console.error("Gmail sync failed", error);
    return Response.json(
      {
        error: "Gmail sync failed",
        detail: msg,
        code,
        hasRefreshToken: Boolean(account.refreshToken),
      },
      { status: 500 }
    );
  }
}


