import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain")?.trim() ?? "";
  const search = searchParams.get("search")?.trim() ?? "";
  const providersRaw = searchParams.get("providers") ?? "";
  const providers = providersRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(
    1,
    Math.min(50, parseInt(searchParams.get("pageSize") ?? "10", 10) || 10)
  );

  const whereClauses: any[] = [];

  if (domain) {
    whereClauses.push({
      OR: [
        { email: { contains: domain, mode: "insensitive" } },
        {
          emailAccounts: {
            some: { emailAddress: { contains: domain, mode: "insensitive" } },
          },
        },
      ],
    });
  }

  if (search) {
    whereClauses.push({
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        {
          emailAccounts: {
            some: { emailAddress: { contains: search, mode: "insensitive" } },
          },
        },
      ],
    });
  }

  if (providers.length > 0) {
    whereClauses.push({
      emailAccounts: {
        some: {
          provider: { in: providers },
        },
      },
    });
  }

  const where = whereClauses.length > 0 ? { AND: whereClauses } : {};

  const total = await prisma.user.count({ where });

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: sort === "newest" ? "desc" : "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      emailAccounts: true,
      preference: true,
    },
  });

  return Response.json({
    items: users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      accounts: u.emailAccounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        emailAddress: a.emailAddress,
      })),
      savedViews: ((u.preference?.savedViews as any) ?? []) as Array<{
        name: string;
        domain: string;
        providers: string[];
      }>,
    })),
    total,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: "Valid email is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const user = await prisma.user.create({
      data: { email: email.trim().toLowerCase() },
    });

    return Response.json(
      { id: user.id, email: user.email, createdAt: user.createdAt },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/users failed", error);

    return new Response(
      JSON.stringify({ error: "Unable to create user." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}



