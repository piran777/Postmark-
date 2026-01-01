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

type ThreadRow = {
  id: string; // id of latest message (used to open detail)
  emailAccountId: string;
  provider: string;
  threadId: string | null;
  subject: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  date: Date | null;
  snippet: string | null;
  isArchived: boolean;
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
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
  const isArchived = parseBool(url.searchParams.get("isArchived"));
  const isRead = parseBool(url.searchParams.get("isRead")); // thread-level: any unread => unread
  const qRaw = url.searchParams.get("q");
  const q = typeof qRaw === "string" ? qRaw.trim() : "";

  // Base where does NOT include isRead; we compute unreadCount per thread.
  const where: Prisma.MessageWhereInput = {
    userId: user.id,
    ...(typeof emailAccountId === "string" && emailAccountId.length ? { emailAccountId } : {}),
    ...(providers.length ? { provider: { in: providers } } : {}),
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

  // We keep this bounded so it stays fast.
  const scanTake = Math.min(1000, Math.max(pageSize * page * 20, pageSize * 50));

  const messages = await prisma.message.findMany({
    where,
    orderBy: [
      { date: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: scanTake,
    select: {
      id: true,
      emailAccountId: true,
      provider: true,
      threadId: true,
      subject: true,
      fromAddress: true,
      toAddress: true,
      date: true,
      snippet: true,
      isRead: true,
      isArchived: true,
    },
  });

  // Build ordered unique thread keys using latest message as representative.
  const ordered: ThreadRow[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    const t = typeof m.threadId === "string" && m.threadId.length ? m.threadId : null;
    const key = t ? `${m.emailAccountId}:${t}` : `${m.emailAccountId}:msg:${m.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({
      id: m.id,
      emailAccountId: m.emailAccountId,
      provider: m.provider,
      threadId: t,
      subject: m.subject,
      fromAddress: m.fromAddress,
      toAddress: m.toAddress,
      date: m.date,
      snippet: m.snippet,
      isArchived: m.isArchived,
    });
  }

  const total = ordered.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = ordered.slice(start, end);
  const hasMore = end < total;

  // Compute counts for threadIds present on this page.
  const threadIds = Array.from(
    new Set(
      pageItems
        .map((i) => i.threadId)
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

  const unreadCounts =
    threadIds.length === 0
      ? new Map<string, number>()
      : new Map(
          (
            await prisma.message.groupBy({
              by: ["emailAccountId", "threadId"],
              where: { userId: user.id, threadId: { in: threadIds }, isRead: false },
              _count: { _all: true },
            })
          ).map((g) => [`${g.emailAccountId}:${g.threadId}`, g._count._all])
        );

  const items = pageItems
    .map((t) => {
      const threadCount = t.threadId ? threadCounts.get(`${t.emailAccountId}:${t.threadId}`) ?? 1 : 1;
      const unreadCount = t.threadId ? unreadCounts.get(`${t.emailAccountId}:${t.threadId}`) ?? 0 : 0;
      return {
        id: t.id,
        provider: t.provider,
        emailAccountId: t.emailAccountId,
        threadId: t.threadId,
        subject: t.subject,
        fromAddress: t.fromAddress,
        toAddress: t.toAddress,
        date: t.date,
        snippet: t.snippet,
        isArchived: t.isArchived,
        threadCount,
        unreadCount,
        isRead: unreadCount === 0,
      };
    })
    .filter((t) => {
      if (typeof isRead !== "boolean") return true;
      return isRead ? t.unreadCount === 0 : t.unreadCount > 0;
    });

  return Response.json({
    items,
    total,
    page,
    pageSize,
    hasMore,
  });
}


