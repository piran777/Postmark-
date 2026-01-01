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

  const emailAccountId = url.searchParams.get("emailAccountId");
  const isRead = parseBool(url.searchParams.get("isRead"));
  const isArchived = parseBool(url.searchParams.get("isArchived"));
  const qRaw = url.searchParams.get("q");
  const q = typeof qRaw === "string" ? qRaw.trim() : "";

  const where: Prisma.MessageWhereInput = {
    userId: user.id,
    ...(typeof emailAccountId === "string" && emailAccountId.length
      ? { emailAccountId }
      : {}),
    ...(providers.length ? { provider: { in: providers } } : {}),
    ...(typeof isRead === "boolean" ? { isRead } : {}),
    ...(typeof isArchived === "boolean" ? { isArchived } : {}),
    ...(q.length
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" } },
            { fromAddress: { contains: q, mode: "insensitive" } },
            { toAddress: { contains: q, mode: "insensitive" } },
            { snippet: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
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

  const threadIds = Array.from(
    new Set(
      items
        .map((m) => m.threadId)
        .filter((t): t is string => typeof t === "string" && t.length > 0)
    )
  );
  const threadCounts =
    threadIds.length === 0
      ? new Map<string, number>()
      : new Map(
          (
            await prisma.message.groupBy({
              by: ["emailAccountId", "threadId"],
              where: { userId: user.id, threadId: { in: threadIds } },
              _count: { _all: true },
            })
          ).map((g) => [`${g.emailAccountId}:${g.threadId}`, g._count._all])
        );

  return Response.json({
    items: items.map((m) => ({
      id: m.id,
      provider: m.provider,
      emailAccountId: m.emailAccountId,
      subject: m.subject,
      fromAddress: m.fromAddress,
      toAddress: m.toAddress,
      date: m.date,
      isRead: m.isRead,
      isArchived: m.isArchived,
      snippet: m.snippet,
      threadId: m.threadId,
      threadCount:
        m.threadId && typeof m.threadId === "string"
          ? threadCounts.get(`${m.emailAccountId}:${m.threadId}`) ?? 1
          : 1,
    })),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}



