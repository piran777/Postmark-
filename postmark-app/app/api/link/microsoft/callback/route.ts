import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Handles Microsoft OAuth callback and links account to user
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("[Microsoft Link] OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      new URL(`/inbox?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/inbox?error=missing_code_or_state", request.url)
    );
  }

  // Decode state to get user ID
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf-8"));
    userId = decoded.userId;
  } catch {
    return NextResponse.redirect(
      new URL("/inbox?error=invalid_state", request.url)
    );
  }

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.redirect(
      new URL("/inbox?error=user_not_found", request.url)
    );
  }

  // Exchange code for tokens
  const clientId = process.env.MICROSOFT_CLIENT_ID!;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;
  const redirectUri = `${getBaseUrl(request)}/api/link/microsoft/callback`;

  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: "openid email profile Mail.Read Mail.ReadWrite offline_access",
    }),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    console.error("[Microsoft Link] Token exchange failed:", errorText);
    return NextResponse.redirect(
      new URL("/inbox?error=token_exchange_failed", request.url)
    );
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const expiresIn = tokens.expires_in;

  // Try to get user info from Microsoft Graph
  let email: string | null = null;
  let providerAccountId: string | null = null;

  // First try the standard /me endpoint
  const userInfoRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (userInfoRes.ok) {
    const userInfo = await userInfoRes.json();
    email = userInfo.mail || userInfo.userPrincipalName;
    providerAccountId = userInfo.id;
  } else {
    // For personal accounts, try decoding the ID token instead
    console.log("[Microsoft Link] /me failed, trying ID token...");
    
    // The ID token is a JWT - decode it to get user info
    const idToken = tokens.id_token;
    if (idToken) {
      try {
        // Decode the JWT payload (middle part)
        const payload = JSON.parse(
          Buffer.from(idToken.split(".")[1], "base64").toString("utf-8")
        );
        email = payload.email || payload.preferred_username;
        providerAccountId = payload.sub || payload.oid;
        console.log("[Microsoft Link] Got info from ID token:", { email, providerAccountId });
      } catch (e) {
        console.error("[Microsoft Link] Failed to decode ID token:", e);
      }
    }
  }

  if (!email || !providerAccountId) {
    console.error("[Microsoft Link] Missing user info:", { email, providerAccountId });
    return NextResponse.redirect(
      new URL("/inbox?error=missing_user_info", request.url)
    );
  }
  
  console.log("[Microsoft Link] Successfully got user info:", { email, providerAccountId });

  // Check if this Microsoft account is already linked to another user
  const existingAccount = await prisma.emailAccount.findFirst({
    where: {
      provider: "microsoft",
      providerAccountId,
    },
  });

  if (existingAccount && existingAccount.userId !== userId) {
    return NextResponse.redirect(
      new URL("/inbox?error=account_already_linked_to_another_user", request.url)
    );
  }

  // Upsert the email account
  await prisma.emailAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: "microsoft",
        providerAccountId,
      },
    },
    create: {
      userId,
      provider: "microsoft",
      providerAccountId,
      emailAddress: email,
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      scope: tokens.scope || null,
      tokenType: tokens.token_type || null,
    },
    update: {
      userId,
      emailAddress: email,
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      ...(expiresIn ? { expiresAt: new Date(Date.now() + expiresIn * 1000) } : {}),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
      ...(tokens.token_type ? { tokenType: tokens.token_type } : {}),
    },
  });

  // Redirect back to inbox with success
  return NextResponse.redirect(
    new URL("/inbox?linked=microsoft", request.url)
  );
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

