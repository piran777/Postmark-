import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const PROVIDERS = ["Gmail", "Outlook", "Other"] as const;
type Provider = (typeof PROVIDERS)[number];

function normalizeProvider(value: unknown): Provider | null {
  if (typeof value !== "string") return null;
  const match = PROVIDERS.find((p) => p.toLowerCase() === value.toLowerCase());
  return match ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;
  const provider = searchParams.get("provider");
  const normalizedProvider = provider ? normalizeProvider(provider) : null;

  const accounts = await prisma.emailAccount.findMany({
    where: {
      userId,
      provider: normalizedProvider ?? undefined,
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(
    accounts.map((a) => ({
      id: a.id,
      userId: a.userId,
      provider: a.provider,
      emailAddress: a.emailAddress,
      createdAt: a.createdAt,
    }))
  );
}

export async function POST(req: NextRequest) {
  try {
    const { userId, provider, emailAddress } = await req.json();
    const normalizedProvider = normalizeProvider(provider);

    if (typeof userId !== "string" || !normalizedProvider) {
      return Response.json(
        { error: "userId and valid provider are required." },
        { status: 400 }
      );
    }

    if (typeof emailAddress !== "string" || emailAddress.trim().length === 0) {
      return Response.json(
        { error: "emailAddress is required." },
        { status: 400 }
      );
    }

    const account = await prisma.emailAccount.create({
      data: {
        userId,
        provider: normalizedProvider,
        emailAddress: emailAddress.trim(),
      },
    });

    return Response.json(
      {
        id: account.id,
        provider: account.provider,
        emailAddress: account.emailAddress,
        userId: account.userId,
      },
      { status: 201 }
    );
  } catch (error: any) {
    // Handle unique constraint (already connected)
    if (error?.code === "P2002") {
      return Response.json(
        { error: "Account already connected for this provider." },
        { status: 409 }
      );
    }

    console.error("POST /api/accounts failed", error);
    return Response.json(
      { error: "Unable to connect account." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId, provider } = await req.json();
    const normalizedProvider = normalizeProvider(provider);

    if (typeof userId !== "string" || !normalizedProvider) {
      return Response.json(
        { error: "userId and valid provider are required." },
        { status: 400 }
      );
    }

    const existing = await prisma.emailAccount.findFirst({
      where: { userId, provider: normalizedProvider },
      select: { id: true },
    });

    if (!existing) {
      return Response.json(
        { error: "No account found for this provider." },
        { status: 404 }
      );
    }

    await prisma.emailAccount.delete({ where: { id: existing.id } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/accounts failed", error);
    return Response.json(
      { error: "Unable to disconnect account." },
      { status: 500 }
    );
  }
}



