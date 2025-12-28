import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { google } from "googleapis";
import { NextRequest } from "next/server";

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

function isGmailHistoryTooOld(err: any): boolean {
  const msg = String(err?.message || "").toLowerCase();
  const code = err?.code ?? err?.status ?? err?.response?.status;
  // Gmail History API typically returns 404 "Requested entity was not found." when startHistoryId is too old.
  // Some clients surface it as 400 with "Invalid start history id".
  return (
    code === 404 ||
    (code === 400 &&
      (msg.includes("start history") ||
        msg.includes("starthistoryid") ||
        msg.includes("invalid start") ||
        msg.includes("historyid")))
  );
}

function normalizeLabelState(labelIds: string[] | null | undefined) {
  const labels = labelIds ?? [];
  const isRead = !labels.includes("UNREAD");
  const isArchived = !labels.includes("INBOX");
  return { labels, isRead, isArchived };
}

export async function POST(req: NextRequest) {
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
  const userId = user.id;
  if (!account.refreshToken && !account.accessToken) {
    return Response.json(
      { error: "Missing Google tokens; reconnect account." },
      { status: 400 }
    );
  }

  // Some environments may be running an older generated Prisma Client.
  // Access these defensively so sync doesn't hard-crash.
  const lastSyncedAt = (account as any).lastSyncedAt as Date | undefined | null;
  const gmailHistoryId = (account as any).gmailHistoryId as
    | string
    | undefined
    | null;

  try {
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") || "delta").toLowerCase();
    const maxResults = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("maxResults") || "25") || 25)
    );

    const oauth2Client = gmailAuth(
      account.accessToken ?? undefined,
      account.refreshToken ?? undefined
    );

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Current mailbox historyId (cursor) - used for true delta sync.
    const profile = await gmail.users.getProfile({ userId: "me" });
    const mailboxHistoryId = profile.data.historyId ?? null;

    async function upsertMessageByProviderId(providerMessageId: string) {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: providerMessageId,
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

      const { labels, isRead, isArchived } = normalizeLabelState(full.data.labelIds);

      await prisma.message.upsert({
        where: {
          provider_providerMessageId: {
            provider: "google",
            providerMessageId,
          },
        },
        create: {
          userId,
          emailAccountId: account.id,
          provider: "google",
          providerMessageId,
          threadId: full.data.threadId ?? null,
          subject,
          fromAddress: from,
          toAddress: to,
          date: dateHeader ? new Date(dateHeader) : null,
          snippet: full.data.snippet ?? null,
          labels,
          isRead,
          isArchived,
        },
        update: {
          threadId: full.data.threadId ?? null,
          subject,
          fromAddress: from,
          toAddress: to,
          date: dateHeader ? new Date(dateHeader) : null,
          snippet: full.data.snippet ?? null,
          labels,
          isRead,
          isArchived,
          syncedAt: new Date(),
        },
      });
    }

    let usedMode: "history" | "query" = "history";
    let q: string | null = null;
    let synced = 0;
    let deleted = 0;
    let updatedHistoryId: string | null = mailboxHistoryId;
    let fallback = false;

    // Full sync (or first time): just fetch the latest inbox messages.
    // Delta sync (preferred): use Gmail History API to apply changes since last cursor.
    if (mode !== "delta" || !gmailHistoryId) {
      usedMode = "query";
      // For "delta" without a cursor, do a safe initial pull; no after: filter.
      const listRes = await gmail.users.messages.list({
        userId: "me",
        maxResults,
        labelIds: ["INBOX"],
      });
      const messages = listRes.data.messages || [];
      for (const msg of messages) {
        if (!msg.id) continue;
        await upsertMessageByProviderId(msg.id);
        synced += 1;
      }
      updatedHistoryId = mailboxHistoryId;
    } else {
      // True delta sync (history cursor)
      try {
        const changedIds = new Set<string>();
        const deletedIds = new Set<string>();
        let pageToken: string | undefined = undefined;
        let pages = 0;

        do {
          pages += 1;
          const histRes: any = await gmail.users.history.list({
            userId: "me",
            startHistoryId: gmailHistoryId,
            pageToken,
            maxResults: 500,
            historyTypes: ["messageAdded", "labelAdded", "labelRemoved", "messageDeleted"],
          });

          const history = histRes.data.history || [];
          for (const h of history) {
            for (const e of h.messagesAdded || []) {
              const id = e.message?.id;
              if (id) changedIds.add(id);
            }
            for (const e of h.labelsAdded || []) {
              const id = e.message?.id;
              if (id) changedIds.add(id);
            }
            for (const e of h.labelsRemoved || []) {
              const id = e.message?.id;
              if (id) changedIds.add(id);
            }
            for (const e of h.messagesDeleted || []) {
              const id = e.message?.id;
              if (id) deletedIds.add(id);
            }
          }

          if (histRes.data.historyId) {
            updatedHistoryId = histRes.data.historyId;
          }

          pageToken = histRes.data.nextPageToken ?? undefined;
        } while (pageToken && pages < 20);

        // Safety valve: if we hit too many pages, force a full resync next time.
        if (pageToken) {
          fallback = true;
          usedMode = "query";
          const listRes = await gmail.users.messages.list({
            userId: "me",
            maxResults,
            labelIds: ["INBOX"],
          });
          const messages = listRes.data.messages || [];
          for (const msg of messages) {
            if (!msg.id) continue;
            await upsertMessageByProviderId(msg.id);
            synced += 1;
          }
          updatedHistoryId = mailboxHistoryId;
        } else {
          if (deletedIds.size > 0) {
            const ids = Array.from(deletedIds);
            const res = await prisma.message.deleteMany({
              where: {
                userId,
                provider: "google",
                providerMessageId: { in: ids },
              },
            });
            deleted += res.count;
          }

          // Any deleted message might also show up in changed set; skip it.
          for (const id of deletedIds) changedIds.delete(id);

          for (const id of changedIds) {
            await upsertMessageByProviderId(id);
            synced += 1;
          }
        }
      } catch (err: any) {
        // Cursor too old: fall back to a full-ish refresh and reset cursor.
        if (isGmailHistoryTooOld(err)) {
          fallback = true;
          usedMode = "query";
          const listRes = await gmail.users.messages.list({
            userId: "me",
            maxResults,
            labelIds: ["INBOX"],
          });
          const messages = listRes.data.messages || [];
          for (const msg of messages) {
            if (!msg.id) continue;
            await upsertMessageByProviderId(msg.id);
            synced += 1;
          }
          updatedHistoryId = mailboxHistoryId;
        } else {
          throw err;
        }
      }
    }

    // Persist delta-sync cursor + clear last error (best effort).
    try {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          lastSyncedAt: new Date(),
          lastSyncError: null,
          // This field exists after the new migration; if not, we'll just warn.
          ...(updatedHistoryId ? { gmailHistoryId: updatedHistoryId } : {}),
        },
      });
    } catch (e) {
      // If Prisma Client is out of date (unknown args), don't break sync.
      console.warn("Unable to persist sync state; run prisma generate.", e);
    }

    return Response.json({
      synced,
      deleted,
      mode,
      usedMode,
      fallback,
      maxResults,
      since: lastSyncedAt ?? null,
      query: q ?? null,
      history: {
        previous: gmailHistoryId ?? null,
        mailbox: mailboxHistoryId,
        stored: updatedHistoryId,
      },
    });
  } catch (error: any) {
    const msg = String(error?.message || "");
    const code = error?.code ?? error?.status ?? error?.response?.status;

    // Best-effort error persistence; never crash the request due to logging.
    try {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncError: msg },
      });
    } catch (e) {
      console.warn("Unable to persist sync error; run prisma generate.", e);
    }

    // Common case when Google didn't grant Gmail scope
    if (code === 403 && msg.toLowerCase().includes("insufficient authentication scopes")) {
      return Response.json(
        {
          error:
            "Gmail permission not granted. Reconnect and approve Gmail access. If you recently upgraded scopes (e.g. to gmail.modify), you must revoke the app in your Google Account and sign in again to refresh the granted scopes.",
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


