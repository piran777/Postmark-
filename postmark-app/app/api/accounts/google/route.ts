import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return Response.json({ success: true });
  }

  await prisma.emailAccount.deleteMany({
    where: { userId: user.id, provider: "google" },
  });

  return Response.json({ success: true });
}





