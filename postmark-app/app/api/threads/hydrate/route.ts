import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
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

function normalizeLabelState(labelIds: string[] | null | undefined) {
  const labels = labelIds ?? [];
  const isRead = !labels.includes("UNREAD");
  const isArchived = !labels.includes("INBOX");
  return { labels, isRead, isArchived };
}

function readGmailHeader(headers: any[], name: string): string {
  const v = headers.find((h) => String(h?.name || "").toLowerCase() === name.toLowerCase())?.value;
  return typeof v === "string" ? v : "";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const messageId = body?.messageId as string | undefined;
  if (!messageId) {
    return Response.json({ error: "Missing messageId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const msg = await prisma.message.findFirst({
    where: { id: messageId, userId: user.id },
    select: {
      id: true,
      provider: true,
      providerMessageId: true,
      emailAccountId: true,
      threadId: true,
    },
  });
  if (!msg) return Response.json({ error: "Message not found" }, { status: 404 });

  if (msg.provider !== "google" || !msg.threadId) {
    return Response.json({ hydrated: 0, skipped: true });
  }

  const tokens = await prisma.emailAccount.findFirst({
    where: { id: msg.emailAccountId, userId: user.id, provider: "google" },
    select: { accessToken: true, refreshToken: true },
  });
  if (!tokens?.accessToken && !tokens?.refreshToken) {
    return Response.json({ error: "Missing Google tokens; reconnect account." }, { status: 400 });
  }

  const oauth2Client = gmailAuth(tokens?.accessToken ?? undefined, tokens?.refreshToken ?? undefined);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const t = await gmail.users.threads.get({
    userId: "me",
    id: msg.threadId,
    format: "metadata",
    metadataHeaders: ["Subject", "From", "To", "Date"],
  });

  const threadMessages = t.data.messages ?? [];
  let hydrated = 0;

  for (const m of threadMessages) {
    const providerMessageId = m.id;
    if (!providerMessageId) continue;
    const headers = m.payload?.headers || [];
    const subject = readGmailHeader(headers, "Subject");
    const from = readGmailHeader(headers, "From");
    const to = readGmailHeader(headers, "To");
    const dateHeader = readGmailHeader(headers, "Date");

    const { labels, isRead, isArchived } = normalizeLabelState(m.labelIds);

    await prisma.message.upsert({
      where: {
        emailAccountId_providerMessageId: {
          emailAccountId: msg.emailAccountId,
          providerMessageId,
        },
      },
      create: {
        userId: user.id,
        emailAccountId: msg.emailAccountId,
        provider: "google",
        providerMessageId,
        threadId: msg.threadId,
        subject: subject || null,
        fromAddress: from || null,
        toAddress: to || null,
        date: dateHeader ? new Date(dateHeader) : null,
        snippet: m.snippet ?? null,
        labels,
        isRead,
        isArchived,
      },
      update: {
        threadId: msg.threadId,
        subject: subject || null,
        fromAddress: from || null,
        toAddress: to || null,
        date: dateHeader ? new Date(dateHeader) : null,
        snippet: m.snippet ?? null,
        labels,
        isRead,
        isArchived,
        syncedAt: new Date(),
      },
    });
    hydrated += 1;
  }

  return Response.json({ hydrated });
}



