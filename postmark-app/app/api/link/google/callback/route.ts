import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Handles Google OAuth callback and links account to user
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("[Google Link] OAuth error:", error);
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
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${getBaseUrl(request)}/api/link/google/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    console.error("[Google Link] Token exchange failed:", errorText);
    return NextResponse.redirect(
      new URL("/inbox?error=token_exchange_failed", request.url)
    );
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const expiresIn = tokens.expires_in;

  // Get user info from Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userInfoRes.ok) {
    return NextResponse.redirect(
      new URL("/inbox?error=userinfo_failed", request.url)
    );
  }

  const userInfo = await userInfoRes.json();
  const email = userInfo.email;
  const providerAccountId = userInfo.id;

  if (!email || !providerAccountId) {
    return NextResponse.redirect(
      new URL("/inbox?error=missing_user_info", request.url)
    );
  }

  // Check if this Google account is already linked to another user
  const existingAccount = await prisma.emailAccount.findFirst({
    where: {
      provider: "google",
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
        provider: "google",
        providerAccountId,
      },
    },
    create: {
      userId,
      provider: "google",
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
    new URL("/inbox?linked=google", request.url)
  );
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

