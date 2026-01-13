import { google } from "googleapis";
import prisma from "@/lib/prisma";

/**
 * Creates a Google OAuth2 client with automatic token refresh.
 * When tokens are refreshed, they're automatically saved back to the database.
 */
export function createGoogleOAuthClient(account: {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth env vars");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  
  oauth2Client.setCredentials({
    access_token: account.accessToken ?? undefined,
    refresh_token: account.refreshToken ?? undefined,
  });

  // Listen for token refresh events and save new tokens to database
  oauth2Client.on("tokens", async (tokens) => {
    console.log(`[Google] Token refreshed for account ${account.id}`);
    
    try {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          accessToken: tokens.access_token ?? undefined,
          // Only update refresh_token if we got a new one
          ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
          expiresAt: tokens.expiry_date 
            ? new Date(tokens.expiry_date) 
            : undefined,
        },
      });
    } catch (err) {
      console.error("[Google] Failed to save refreshed tokens:", err);
    }
  });

  return oauth2Client;
}

/**
 * Simple OAuth client for cases where we don't need to save tokens
 * (e.g., one-off operations where account context isn't available)
 */
export function createSimpleGoogleOAuthClient(
  accessToken?: string,
  refreshToken?: string
) {
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

