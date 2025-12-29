"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Message = {
  id: string;
  provider: string;
  subject: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  date: string | null;
  isRead: boolean;
  isArchived: boolean;
  snippet: string | null;
};

type EmailAccount = {
  id: string;
  provider: string;
  emailAddress: string;
};

type SyncInfo = {
  synced?: number;
  deleted?: number;
  mode?: string;
  usedMode?: string;
  fallback?: boolean;
  maxResults?: number;
  since?: string | null;
  query?: string | null;
  history?: {
    previous?: string | null;
    mailbox?: string | null;
    stored?: string | null;
  };
};

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [hasMore, setHasMore] = useState(false);

  const [provider, setProvider] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all");
  const [archiveFilter, setArchiveFilter] = useState<"inbox" | "archived" | "all">(
    "inbox"
  );

  function FilterPill(props: {
    selected: boolean;
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-pressed={props.selected}
        onClick={props.onClick}
        disabled={props.disabled}
        className={cn(
          "h-8 rounded-full px-3 text-xs font-semibold",
          props.selected &&
            "border-border-strong bg-surface-strong shadow-sm hover:bg-surface-strong"
        )}
      >
        {props.children}
      </Button>
    );
  }

  function buildQuery(nextPage: number) {
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    if (provider !== "all") params.set("provider", provider);
    if (accountId !== "all") params.set("emailAccountId", accountId);
    if (readFilter === "read") params.set("isRead", "true");
    if (readFilter === "unread") params.set("isRead", "false");
    if (archiveFilter === "inbox") params.set("isArchived", "false");
    if (archiveFilter === "archived") params.set("isArchived", "true");
    return params.toString();
  }

  async function loadAccounts() {
    try {
      const res = await fetch("/api/accounts?me=true");
      if (!res.ok) return;
      const data = (await res.json().catch(() => [])) as any[];
      const list: EmailAccount[] = (data || []).map((a) => ({
        id: String(a.id),
        provider: String(a.provider),
        emailAddress: String(a.emailAddress),
      }));
      setAccounts(list);
    } catch {
      // ignore
    }
  }

  async function loadMessages(opts?: { reset?: boolean; page?: number }) {
    const reset = opts?.reset ?? false;
    const nextPage = opts?.page ?? (reset ? 1 : page);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages?${buildQuery(nextPage)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to load messages");
      }
      const data = await res.json();
      const nextItems = (data.items || []) as Message[];
      setHasMore(Boolean(data.hasMore));
      setPage(Number(data.page || nextPage));
      setMessages((prev) => (reset ? nextItems : [...prev, ...nextItems]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load messages");
    } finally {
      setLoading(false);
    }
  }

  async function syncGmail() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("mode", "delta");
      params.set("maxResults", "25");
      if (accountId !== "all") params.set("emailAccountId", accountId);

      const res = await fetch(`/api/sync/gmail?${params.toString()}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Sync failed");
      }
      const info = (await res.json().catch(() => null)) as SyncInfo | null;
      if (info) setLastSync(info);
      await loadMessages({ reset: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  async function actOnMessage(messageId: string, action: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Action failed");
      }
      const data = await res.json();
      const updated = data.item as Message | undefined;
      if (updated?.id) {
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  async function disconnectGmail() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/google", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Disconnect failed");
      }
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    setMessages([]);
    loadMessages({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, readFilter, archiveFilter, accountId]);

  useEffect(() => {
    loadAccounts();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">Inbox</span>
            <Badge tone="success" soft>
              prototype
            </Badge>
            {lastSync?.since && (
              <span className="hidden text-xs text-muted sm:inline">
                Last sync: {new Date(lastSync.since).toLocaleString()}
              </span>
            )}
            {lastSync && (
              <span className="hidden text-xs text-muted sm:inline">
                • {lastSync.usedMode === "history" ? "Delta" : "Refresh"} • synced{" "}
                {lastSync.synced ?? 0}
                {typeof lastSync.deleted === "number" && lastSync.deleted > 0
                  ? ` • deleted ${lastSync.deleted}`
                  : ""}
                {lastSync.fallback ? " • fallback" : ""}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadMessages({ reset: true })}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/api/auth/signout?callbackUrl=/auth/signin">Sign out</Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={disconnectGmail} disabled={loading}>
              Disconnect Gmail
            </Button>
            <Button size="sm" onClick={syncGmail} disabled={loading}>
              Sync Gmail
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <Card className="border-border bg-surface">
          <CardHeader className="border-border/60">
            <CardTitle className="text-sm font-semibold text-muted">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Account</span>
              <FilterPill
                selected={accountId === "all"}
                onClick={() => setAccountId("all")}
                disabled={loading}
              >
                All
              </FilterPill>
              {accounts.map((a) => (
                <FilterPill
                  key={a.id}
                  selected={accountId === a.id}
                  onClick={() => setAccountId(a.id)}
                  disabled={loading}
                >
                  {a.provider === "google" ? "Gmail" : a.provider}: {a.emailAddress}
                </FilterPill>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Provider</span>
              <FilterPill
                selected={provider === "all"}
                onClick={() => setProvider("all")}
                disabled={loading}
              >
                All
              </FilterPill>
              <FilterPill
                selected={provider === "google"}
                onClick={() => setProvider("google")}
                disabled={loading}
              >
                Gmail
              </FilterPill>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Status</span>
              <FilterPill
                selected={readFilter === "all"}
                onClick={() => setReadFilter("all")}
                disabled={loading}
              >
                All
              </FilterPill>
              <FilterPill
                selected={readFilter === "unread"}
                onClick={() => setReadFilter("unread")}
                disabled={loading}
              >
                Unread
              </FilterPill>
              <FilterPill
                selected={readFilter === "read"}
                onClick={() => setReadFilter("read")}
                disabled={loading}
              >
                Read
              </FilterPill>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Folder</span>
              <FilterPill
                selected={archiveFilter === "inbox"}
                onClick={() => setArchiveFilter("inbox")}
                disabled={loading}
              >
                Inbox
              </FilterPill>
              <FilterPill
                selected={archiveFilter === "archived"}
                onClick={() => setArchiveFilter("archived")}
                disabled={loading}
              >
                Archived
              </FilterPill>
              <FilterPill
                selected={archiveFilter === "all"}
                onClick={() => setArchiveFilter("all")}
                disabled={loading}
              >
                All
              </FilterPill>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-muted">
            No messages yet. Connect Gmail and run sync.
          </div>
        ) : (
          <Card className="border-border bg-surface">
            <CardHeader className="border-border/60">
              <CardTitle className="text-sm font-semibold text-muted">
                {messages.length} messages
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/70">
              {messages.map((m) => (
                <div key={m.id} className="flex flex-col gap-1 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge tone="info" soft>
                        {m.provider}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">
                        {m.subject || "(No subject)"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">
                        {m.date ? new Date(m.date).toLocaleString() : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={loading}
                        onClick={() =>
                          actOnMessage(m.id, m.isRead ? "markUnread" : "markRead")
                        }
                        className="h-8 px-2 text-xs"
                      >
                        {m.isRead ? "Mark unread" : "Mark read"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={loading}
                        onClick={() =>
                          actOnMessage(m.id, m.isArchived ? "unarchive" : "archive")
                        }
                        className="h-8 px-2 text-xs"
                      >
                        {m.isArchived ? "Move to inbox" : "Archive"}
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    {m.fromAddress} → {m.toAddress}
                  </div>
                  {m.snippet && (
                    <div className="text-xs text-muted">{m.snippet}</div>
                  )}
                  <div className="flex gap-2 text-[11px] text-muted">
                    <span>{m.isRead ? "Read" : "Unread"}</span>
                    <span>•</span>
                    <span>{m.isArchived ? "Archived" : "Inbox"}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted">
            Page {page}
            {hasMore ? "" : " • End"}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadMessages({ reset: true })}
              disabled={loading}
            >
              Reload
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const next = page + 1;
                loadMessages({ page: next });
              }}
              disabled={loading || !hasMore}
            >
              Load more
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}


