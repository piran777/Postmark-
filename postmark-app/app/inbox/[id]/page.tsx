import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { MessageToolbar } from "./MessageToolbar";
import { MessageBody } from "./MessageBody";

function parseAddress(raw: string | null | undefined): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null };
  const text = String(raw).trim();
  // Common: "Name <email@domain>"
  const angle = text.match(/^(.*)<([^>]+)>$/);
  if (angle) {
    const name = angle[1]?.trim().replace(/^"(.+)"$/, "$1") || null;
    const email = angle[2]?.trim() || null;
    return { name: name && name.length ? name : null, email };
  }
  // Just an email?
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) return { name: null, email: emailMatch[0] };
  return { name: text, email: null };
}

export default async function MessageDetailPage(props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/auth/signin");

  const { id } = await props.params;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) redirect("/auth/signin");

  const msg = await prisma.message.findFirst({
    where: { id, userId: user.id },
    include: {
      emailAccount: {
        select: {
          id: true,
          provider: true,
          emailAddress: true,
        },
      },
    },
  });

  if (!msg) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <Button variant="secondary" asChild>
            <Link href="/inbox">Back to inbox</Link>
          </Button>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
          <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted shadow-sm">
            Message not found.
          </div>
        </div>
      </div>
    );
  }

  const threadMessages =
    msg.threadId && msg.emailAccountId
      ? await prisma.message.findMany({
          where: {
            userId: user.id,
            emailAccountId: msg.emailAccountId,
            threadId: msg.threadId,
          },
          orderBy: [
            { date: { sort: "asc", nulls: "last" } },
            { createdAt: "asc" },
            { id: "asc" },
          ],
          select: {
            id: true,
            providerMessageId: true,
            subject: true,
            fromAddress: true,
            toAddress: true,
            date: true,
            snippet: true,
            isRead: true,
            isArchived: true,
          },
        })
      : [];

  const providerLabel =
    msg.provider === "google"
      ? "Gmail"
      : msg.provider?.slice(0, 1).toUpperCase() + msg.provider.slice(1);

  const from = parseAddress(msg.fromAddress);
  const to = parseAddress(msg.toAddress);
  const avatarLetter =
    (from.name?.trim()?.[0] || from.email?.trim()?.[0] || "?").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border bg-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <MessageToolbar
            messageId={msg.id}
            isRead={msg.isRead}
            isArchived={msg.isArchived}
          />

          <div className="hidden items-center gap-2 text-xs text-muted sm:flex">
            <Badge tone="info" soft>
              {providerLabel}
            </Badge>
            <span className="truncate">
              {msg.emailAccount?.emailAddress ? `Account: ${msg.emailAccount.emailAddress}` : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="rounded-2xl border border-border bg-surface shadow-sm">
          {/* Subject row */}
          <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-lg font-medium leading-snug text-foreground sm:text-xl">
                  {msg.subject || "(No subject)"}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone="neutral" soft>
                    {msg.isArchived ? "Archived" : "Inbox"}
                  </Badge>
                  <Badge tone={msg.isRead ? "neutral" : "success"} soft>
                    {msg.isRead ? "Read" : "Unread"}
                  </Badge>
                  {threadMessages.length > 1 ? (
                    <Badge tone="info" soft>
                      Conversation • {threadMessages.length}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full p-0"
                  title="Star (coming soon)"
                  disabled
                >
                  <Star className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Sender row */}
          <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold text-foreground">
                {avatarLetter}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {from.name || from.email || msg.fromAddress || "Unknown sender"}
                  </div>
                  {from.name && from.email ? (
                    <div className="truncate text-xs text-muted">&lt;{from.email}&gt;</div>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted">
                  To:{" "}
                  <span className="text-foreground/90">
                    {to.email || to.name || msg.toAddress || "-"}
                  </span>
                </div>
              </div>
            </div>

            <div className="shrink-0 text-xs text-muted">
              {msg.date ? new Date(msg.date).toLocaleString() : ""}
            </div>
          </div>

          {/* Conversation */}
          {threadMessages.length > 1 ? (
            <div className="border-t border-border/70 px-5 py-4 sm:px-6">
              <div className="mb-2 text-xs font-semibold text-muted">Conversation</div>
              <div className="space-y-2">
                {threadMessages.map((t) => {
                  const isCurrent = t.id === msg.id;
                  const dateText = t.date ? new Date(t.date).toLocaleString() : "";
                  return (
                    <div
                      key={t.id}
                      className={[
                        "rounded-xl border px-4 py-3 text-sm",
                        isCurrent
                          ? "border-border-strong bg-background/30"
                          : "border-border/70 bg-background/20",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">
                            {t.fromAddress || "Unknown sender"}
                          </div>
                          <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
                            <div className="truncate text-foreground/90">
                              {t.subject || "(No subject)"}
                            </div>
                            {!isCurrent ? (
                              <Link
                                href={`/inbox/${t.id}`}
                                className="shrink-0 text-xs font-semibold text-muted underline-offset-2 hover:underline"
                              >
                                Open
                              </Link>
                            ) : (
                              <span className="shrink-0 text-xs font-semibold text-muted">
                                Viewing
                              </span>
                            )}
                          </div>
                          {t.snippet ? (
                            <div className="mt-1 line-clamp-2 text-xs text-muted">{t.snippet}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-xs text-muted">{dateText}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Body */}
          <div className="px-5 pb-6 sm:px-6">
            <MessageBody messageId={msg.id} fallbackText={msg.snippet} />

            <div className="mt-3 text-xs text-muted">
              Body is loaded on-demand and rendered in a sandboxed iframe (scripts disabled).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


