import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Initiates Microsoft OAuth flow to LINK an account (not sign in)
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    // Redirect to sign in if not logged in
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Microsoft OAuth not configured" },
      { status: 500 }
    );
  }

  // Build the Microsoft OAuth URL
  const redirectUri = `${getBaseUrl(request)}/api/link/microsoft/callback`;
  const scope = "openid email profile Mail.Read Mail.ReadWrite offline_access";
  
  // Include user ID in state so callback knows who to link to
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64");

  const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  // select_account forces the account picker to show (for linking multiple accounts)
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

