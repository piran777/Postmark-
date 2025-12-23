import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    return Response.json({ items: [] });
  }

  const items = await prisma.message.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 50,
  });

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
  });
}



