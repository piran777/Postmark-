import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Microsoft Graph API base URL
const GRAPH_API = "https://graph.microsoft.com/v1.0";

// Refresh the access token using the refresh token
async function refreshMicrosoftToken(account: {
  id: string;
  refreshToken: string | null;
}): Promise<string | null> {
  if (!account.refreshToken) return null;

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
    scope: "openid email profile Mail.Read Mail.ReadWrite offline_access",
  });

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    console.error("[Microsoft] Token refresh failed:", await res.text());
    return null;
  }

  const data = await res.json();
  
  // Update the stored tokens
  await prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || account.refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    },
  });

  return data.access_token;
}

// Fetch messages from Microsoft Graph API
async function fetchMicrosoftMessages(
  accessToken: string,
  maxResults: number = 25
): Promise<any[]> {
  const res = await fetch(
    `${GRAPH_API}/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Microsoft Graph API error: ${error}`);
  }

  const data = await res.json();
  return data.value || [];
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxResults = parseInt(searchParams.get("maxResults") || "25", 10);
  const emailAccountId = searchParams.get("emailAccountId");
  const syncAll = searchParams.get("all") === "true";

  // Get Microsoft accounts to sync
  let accounts;
  if (syncAll) {
    accounts = await prisma.emailAccount.findMany({
      where: {
        userId: userId,
        provider: "microsoft",
      },
    });
  } else if (emailAccountId) {
    const account = await prisma.emailAccount.findFirst({
      where: {
        id: emailAccountId,
        userId: userId,
        provider: "microsoft",
      },
    });
    accounts = account ? [account] : [];
  } else {
    return NextResponse.json(
      { error: "Provide emailAccountId or all=true" },
      { status: 400 }
    );
  }

  if (accounts.length === 0) {
    return NextResponse.json(
      { error: "No Microsoft accounts found" },
      { status: 404 }
    );
  }

  const results: Array<{
    emailAccountId: string;
    emailAddress: string;
    synced: number;
    error?: string;
  }> = [];

  for (const account of accounts) {
    try {
      // Get a valid access token (refresh if needed)
      let accessToken = account.accessToken;
      
      // Check if token is expired or will expire soon
      const tokenExpired = account.expiresAt && new Date(account.expiresAt) < new Date(Date.now() + 60000);
      
      if (!accessToken || tokenExpired) {
        accessToken = await refreshMicrosoftToken({
          id: account.id,
          refreshToken: account.refreshToken,
        });
      }

      if (!accessToken) {
        throw new Error("Unable to get valid access token. Please reconnect your Microsoft account.");
      }

      // Fetch messages from Microsoft Graph
      const messages = await fetchMicrosoftMessages(accessToken, maxResults);

      let syncedCount = 0;

      for (const msg of messages) {
        const providerMessageId = msg.id;

        // Check if message already exists
        const existing = await prisma.message.findUnique({
          where: {
            emailAccountId_providerMessageId: {
              emailAccountId: account.id,
              providerMessageId,
            },
          },
        });

        if (existing) continue;

        // Extract sender info
        const fromEmail = msg.from?.emailAddress?.address || null;
        const fromName = msg.from?.emailAddress?.name || null;
        const fromAddress = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

        // Extract recipient
        const toRecipient = msg.toRecipients?.[0]?.emailAddress?.address || null;

        // Build labels
        const labels: string[] = ["INBOX"];
        if (msg.isRead) labels.push("READ");

        // Create message
        await prisma.message.create({
          data: {
            userId: userId,
            emailAccountId: account.id,
            provider: "microsoft",
            providerMessageId,
            threadId: msg.conversationId || null,
            subject: msg.subject || "(No subject)",
            fromAddress,
            toAddress: toRecipient,
            date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
            snippet: msg.bodyPreview || null,
            labels,
            isRead: msg.isRead || false,
            isArchived: false,
          },
        });

        syncedCount++;
      }

      results.push({
        emailAccountId: account.id,
        emailAddress: account.emailAddress,
        synced: syncedCount,
      });

      // Update last sync time
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          lastSyncedAt: new Date(),
          lastSyncError: null,
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Sync failed";
      results.push({
        emailAccountId: account.id,
        emailAddress: account.emailAddress,
        synced: 0,
        error: errorMsg,
      });

      // Store sync error
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          lastSyncError: errorMsg,
        },
      });
    }
  }

  const hasErrors = results.some((r) => r.error);
  return NextResponse.json(
    { results },
    { status: hasErrors && results.length === 1 ? 500 : 200 }
  );
}

