import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      emailAccounts: true,
    },
  });

  return Response.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      accounts: u.emailAccounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        emailAddress: a.emailAddress,
      })),
    }))
  );
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


