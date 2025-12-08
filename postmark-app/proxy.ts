import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = [/^\/users/, /^\/api\/users/, /^\/api\/accounts/, /^\/api\/preferences/];

function needsAuth(pathname: string) {
  return PROTECTED.some((re) => re.test(pathname));
}

// Next.js proxy entry point
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!needsAuth(pathname)) return NextResponse.next();

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse("ADMIN_PASSWORD not set", {
      status: 500,
    });
  }

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Admin Area"',
      },
    });
  }

  const base64 = auth.split(" ")[1] ?? "";
  const decoded = Buffer.from(base64, "base64").toString("utf8");
  const [, suppliedPassword] = decoded.split(":");

  if (suppliedPassword !== password) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/users",
    "/api/users/:path*",
    "/api/accounts/:path*",
    "/api/preferences/:path*",
  ],
};

