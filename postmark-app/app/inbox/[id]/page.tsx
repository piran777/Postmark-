import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { MessageToolbar } from "./MessageToolbar";
import { google } from "googleapis";

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

function gmailAuth(accessToken?: string, refreshToken?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth env vars");
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return oauth2Client;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function stripScripts(html: string) {
  // Defense-in-depth: we also sandbox the iframe (no scripts allowed), but remove scripts anyway.
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

function findMimeParts(payload: any, out: Array<{ mimeType: string; data: string }>) {
  if (!payload) return;
  const mimeType = payload.mimeType as string | undefined;
  const data = payload.body?.data as string | undefined;
  if (mimeType && data) out.push({ mimeType, data });
  const parts = payload.parts as any[] | undefined;
  if (Array.isArray(parts)) {
    for (const p of parts) findMimeParts(p, out);
  }
}

async function fetchGmailBody(opts: {
  providerMessageId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}): Promise<{ html: string | null; text: string | null }> {
  if (!opts.providerMessageId) return { html: null, text: null };
  if (!opts.accessToken && !opts.refreshToken) return { html: null, text: null };

  const oauth2Client = gmailAuth(opts.accessToken ?? undefined, opts.refreshToken ?? undefined);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.messages.get({
    userId: "me",
    id: opts.providerMessageId,
    format: "full",
  });

  const payload = res.data.payload;
  const found: Array<{ mimeType: string; data: string }> = [];
  findMimeParts(payload, found);

  const htmlPart =
    found.find((p) => p.mimeType === "text/html") ??
    found.find((p) => p.mimeType?.startsWith("multipart/related"));
  const textPart = found.find((p) => p.mimeType === "text/plain");

  const html = htmlPart?.data ? stripScripts(decodeBase64Url(htmlPart.data)) : null;
  const text = textPart?.data ? decodeBase64Url(textPart.data) : null;
  return { html, text };
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
          accessToken: true,
          refreshToken: true,
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

  const providerLabel =
    msg.provider === "google"
      ? "Gmail"
      : msg.provider?.slice(0, 1).toUpperCase() + msg.provider.slice(1);

  const from = parseAddress(msg.fromAddress);
  const to = parseAddress(msg.toAddress);
  const avatarLetter =
    (from.name?.trim()?.[0] || from.email?.trim()?.[0] || "?").toUpperCase();

  let gmailBody: { html: string | null; text: string | null } = { html: null, text: null };
  if (msg.provider === "google") {
    try {
      gmailBody = await fetchGmailBody({
        providerMessageId: msg.providerMessageId,
        accessToken: msg.emailAccount?.accessToken ?? null,
        refreshToken: msg.emailAccount?.refreshToken ?? null,
      });
    } catch {
      gmailBody = { html: null, text: null };
    }
  }

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

          {/* Body */}
          <div className="px-5 pb-6 sm:px-6">
            {gmailBody.html ? (
              <div className="overflow-hidden rounded-xl border border-border/70 bg-background/40">
                <iframe
                  title="Message body"
                  sandbox=""
                  className="h-[60vh] w-full bg-transparent"
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" />
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 16px; font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: inherit; }
</style></head><body>${gmailBody.html}</body></html>`}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 bg-background/40 px-4 py-4 text-sm text-foreground">
                {gmailBody.text ? (
                  <div className="whitespace-pre-wrap">{gmailBody.text}</div>
                ) : msg.snippet ? (
                  <div className="whitespace-pre-wrap">{msg.snippet}</div>
                ) : (
                  <div className="text-muted">No body available.</div>
                )}
              </div>
            )}

            <div className="mt-3 text-xs text-muted">
              Gmail body is fetched live and rendered in a sandboxed iframe (scripts disabled).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


