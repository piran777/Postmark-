import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function parseBool(value: string | null): boolean | undefined {
  if (value == null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    return Response.json({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      hasMore: false,
    });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("pageSize") || "25") || 25)
  );

  const providerParam = url.searchParams.get("provider");
  const providers = providerParam
    ? providerParam
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const isRead = parseBool(url.searchParams.get("isRead"));
  const isArchived = parseBool(url.searchParams.get("isArchived"));

  const where: Prisma.MessageWhereInput = {
    userId: user.id,
    ...(providers.length ? { provider: { in: providers } } : {}),
    ...(typeof isRead === "boolean" ? { isRead } : {}),
    ...(typeof isArchived === "boolean" ? { isArchived } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: [
        { date: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return Response.json({
    items: items.map((m) => ({
      id: m.id,
      provider: m.provider,
      subject: m.subject,
      fromAddress: m.fromAddress,
      toAddress: m.toAddress,
      date: m.date,
      isRead: m.isRead,
      isArchived: m.isArchived,
      snippet: m.snippet,
    })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}



