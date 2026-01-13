import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest } from "next/server";

// DELETE /api/accounts/[id] - Unlink a specific email account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Make sure the account belongs to this user
  const account = await prisma.emailAccount.findFirst({
    where: { id, userId },
    select: { id: true, emailAddress: true, provider: true },
  });

  if (!account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  // Delete the account (messages will cascade delete)
  await prisma.emailAccount.delete({ where: { id } });

  return Response.json({
    success: true,
    deleted: {
      id: account.id,
      emailAddress: account.emailAddress,
      provider: account.provider,
    },
  });
}

