"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  Archive,
  Inbox,
  Mail,
  MailOpen,
  RefreshCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Send,
  Star,
  Trash2,
  PenSquare,
} from "lucide-react";

type Message = {
  id: string;
  provider: string;
  emailAccountId?: string;
  subject: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  date: string | null;
  isRead: boolean;
  isArchived: boolean;
  snippet: string | null;
  threadId?: string | null;
  threadCount?: number;
  unreadCount?: number;
};

type EmailAccount = {
  id: string;
  provider: string;
  emailAddress: string;
};

type SyncInfo = {
  all?: boolean;
  totals?: {
    synced: number;
    deleted: number;
    errors: number;
  };
  accounts?: Array<{
    emailAccountId: string;
    emailAddress: string | null;
    synced?: number;
    deleted?: number;
    usedMode?: string;
    fallback?: boolean;
    error?: string;
    code?: number;
  }>;
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

function parseFrom(raw: string | null | undefined): { display: string; avatar: string } {
  const text = String(raw || "").trim();
  if (!text) return { display: "Unknown", avatar: "?" };
  const angle = text.match(/^(.*)<([^>]+)>$/);
  const name = angle?.[1]?.trim().replace(/^"(.+)"$/, "$1");
  const email = angle?.[2]?.trim();
  const display = (name && name.length ? name : email) || text;
  const first = (display.trim()[0] || "?").toUpperCase();
  return { display, avatar: first };
}

export default function InboxPage() {
  const router = useRouter();
  const prefetched = useRef<Set<string>>(new Set());
  const prefetchedBodies = useRef<Set<string>>(new Set());
  const searchTimer = useRef<number | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
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
  const [view, setView] = useState<"threads" | "messages">("threads");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

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

  function IconPillButton(props: {
    label: string;
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title={props.label}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
        className="h-9 w-9 rounded-full p-0"
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
    if (searchQuery.trim().length) params.set("q", searchQuery.trim());
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
      const endpoint = view === "threads" ? "/api/threads" : "/api/messages";
      const res = await fetch(`${endpoint}?${buildQuery(nextPage)}`);
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

  async function syncSelectedGmail() {
    setLoading(true);
    setError(null);
    try {
      if (accountId === "all") {
        throw new Error("Select an account to sync, or use “Sync all”.");
      }
      const params = new URLSearchParams();
      params.set("mode", "delta");
      params.set("maxResults", "25");
      params.set("emailAccountId", accountId);

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

  async function syncAllGmail() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("mode", "delta");
      params.set("maxResults", "25");
      params.set("all", "true");

      const res = await fetch(`/api/sync/gmail?${params.toString()}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Sync failed");
      }
      const info = (await res.json().catch(() => null)) as SyncInfo | null;
      if (info) setLastSync(info);
      if (info?.all && (info.totals?.errors ?? 0) > 0) {
        const details = (info.accounts || [])
          .filter((a) => Boolean(a.error))
          .slice(0, 3)
          .map((a) => `${a.emailAddress || a.emailAccountId}: ${a.error}`)
          .join(" | ");
        setError(
          `Sync all finished with ${info.totals?.errors ?? 0} error(s). ${details}`
        );
      }
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
  }, [provider, readFilter, archiveFilter, accountId, view, searchQuery]);

  // Debounce search input like Gmail.
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setSearchQuery(searchDraft);
    }, 250);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [searchDraft]);

  // Close filter popover on outside click / escape.
  useEffect(() => {
    if (!showFilters) return;

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (filtersRef.current?.contains(target)) return;
      if (filtersButtonRef.current?.contains(target)) return;
      setShowFilters(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowFilters(false);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showFilters]);

  useEffect(() => {
    loadAccounts();
  }, []);

  // When a specific account is selected, make provider follow that account (prevents contradictory state).
  useEffect(() => {
    if (accountId === "all") return;
    const acct = accounts.find((a) => a.id === accountId);
    if (acct && acct.provider && provider !== acct.provider) {
      setProvider(acct.provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, accounts]);

  // If user explicitly changes provider while an account is selected, interpret it as "show all accounts for that provider".
  useEffect(() => {
    if (accountId === "all") return;
    const acct = accounts.find((a) => a.id === accountId);
    if (acct && provider !== "all" && provider !== acct.provider) {
      setAccountId("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const visibleAccounts =
    provider === "all" ? accounts : accounts.filter((a) => a.provider === provider);

  const selectedAccount = accountId === "all" ? null : accounts.find((a) => a.id === accountId);

  async function prefetchBody(messageId: string) {
    if (prefetchedBodies.current.has(messageId)) return;
    prefetchedBodies.current.add(messageId);
    const cacheKey = `pm:messageBody:${messageId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return;
    } catch {
      // ignore
    }
    try {
      const res = await fetch(`/api/messages/${messageId}?includeBody=true`, {
        method: "GET",
        headers: { "content-type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      const body = data?.item?.body ?? null;
      if (body && (body.html || body.text)) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(body));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  const providerLabelForHeader =
    selectedAccount?.provider === "google"
      ? "Gmail"
      : selectedAccount?.provider
        ? selectedAccount.provider
        : provider === "google"
          ? "Gmail"
          : provider === "all"
            ? "All"
            : provider;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Gmail-ish top bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-3 py-2 sm:px-4">
          {/* Left gutter matches sidebar width on desktop so search aligns with tabs/content */}
          <div className="flex items-center gap-2 lg:w-[256px] lg:shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-strong">
              <span className="text-sm font-black tracking-tight">P</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold">Postmark</div>
              <div className="text-[11px] text-muted">{providerLabelForHeader}</div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center">
            <div className="relative w-full max-w-[720px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search mail"
                className={cn(
                  "h-10 w-full rounded-full border border-border bg-surface px-10 text-sm outline-none",
                  "focus:border-border-strong focus:bg-background"
                )}
              />
              <button
                type="button"
                title="Filters"
                aria-label="Filters"
                ref={filtersButtonRef}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted hover:bg-surface-strong",
                  showFilters && "bg-surface-strong"
                )}
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>

              {/* Gmail-ish filter popover */}
              {showFilters ? (
                <div
                  ref={filtersRef}
                  className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-border bg-surface p-3 shadow-lg"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">Filters</div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-full px-3 text-xs font-semibold"
                        onClick={() => {
                          setProvider("all");
                          setReadFilter("all");
                          setArchiveFilter("inbox");
                          setView("threads");
                          setAccountId("all");
                        }}
                        disabled={loading}
                        title="Reset filters"
                      >
                        Reset
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 rounded-full px-3 text-xs font-semibold"
                        onClick={() => setShowFilters(false)}
                      >
                        Done
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted">View</div>
                      <div className="flex flex-wrap gap-2">
                        <FilterPill
                          selected={view === "threads"}
                          onClick={() => setView("threads")}
                          disabled={loading}
                        >
                          Threads
                        </FilterPill>
                        <FilterPill
                          selected={view === "messages"}
                          onClick={() => setView("messages")}
                          disabled={loading}
                        >
                          Messages
                        </FilterPill>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted">Provider</div>
                      <div className="flex flex-wrap gap-2">
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
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted">Status</div>
                      <div className="flex flex-wrap gap-2">
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
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted">Folder</div>
                      <div className="flex flex-wrap gap-2">
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
                          All mail
                        </FilterPill>
                      </div>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <div className="text-xs font-semibold text-muted">Account</div>
                      <div className="flex flex-wrap gap-2">
                        <FilterPill
                          selected={accountId === "all"}
                          onClick={() => setAccountId("all")}
                          disabled={loading}
                        >
                          All
                        </FilterPill>
                        {visibleAccounts.map((a) => (
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
                      {searchDraft.length ? (
                        <div className="pt-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full px-3 text-xs font-semibold"
                            onClick={() => setSearchDraft("")}
                            disabled={loading}
                          >
                            Clear search
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full p-0"
              title="Refresh"
              onClick={() => loadMessages({ reset: true })}
              disabled={loading}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={syncSelectedGmail}
              disabled={loading || accountId === "all"}
              title={accountId === "all" ? "Select an account to sync" : "Sync selected"}
              className="hidden sm:inline-flex"
            >
              Sync
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={syncAllGmail}
              disabled={loading}
              className="hidden sm:inline-flex"
            >
              Sync all
            </Button>

            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/api/auth/signout?callbackUrl=/auth/signin">Sign out</Link>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-full p-0"
              title="Settings (coming soon)"
              disabled
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-4 px-3 py-4 sm:px-4">
        {/* Gmail-ish left sidebar */}
        <aside className="hidden w-[256px] shrink-0 lg:block">
          <div className="sticky top-[64px] space-y-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start gap-2 rounded-2xl"
              disabled
              title="Compose (coming soon)"
            >
              <PenSquare className="h-4 w-4" />
              Compose
            </Button>

            <div className="space-y-1">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-strong"
                onClick={() => setArchiveFilter("inbox")}
              >
                <span className="inline-flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-muted" />
                  Inbox
                </span>
                <span className="text-xs text-muted">{messages.length}</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-muted opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                disabled
                title="Coming soon"
              >
                <span className="inline-flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Starred
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-muted opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                disabled
                title="Coming soon"
              >
                <span className="inline-flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Sent
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-strong"
                onClick={() => setArchiveFilter("archived")}
              >
                <span className="inline-flex items-center gap-2">
                  <Archive className="h-4 w-4 text-muted" />
                  Archived
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-strong"
                onClick={() => setArchiveFilter("all")}
              >
                <span className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted" />
                  All mail
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-muted opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                disabled
                title="Coming soon"
              >
                <span className="inline-flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Trash
                </span>
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-3">
              <div className="mb-2 text-xs font-semibold text-muted">Accounts</div>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  selected={accountId === "all"}
                  onClick={() => setAccountId("all")}
                  disabled={loading}
                >
                  All
                </FilterPill>
                {visibleAccounts.map((a) => (
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
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={disconnectGmail}
                  disabled={loading}
                  className="w-full"
                >
                  Disconnect Gmail
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Tabs row (Postmark-style, replaces Gmail Primary/Promotions/Social) */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setArchiveFilter("inbox");
                  setReadFilter("all");
                }}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-semibold",
                  archiveFilter === "inbox" && readFilter === "all"
                    ? "bg-surface-strong text-foreground"
                    : "text-muted hover:bg-surface"
                )}
              >
                Inbox
              </button>
              <button
                type="button"
                onClick={() => {
                  setArchiveFilter("inbox");
                  setReadFilter("unread");
                }}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-semibold",
                  archiveFilter === "inbox" && readFilter === "unread"
                    ? "bg-surface-strong text-foreground"
                    : "text-muted hover:bg-surface"
                )}
              >
                Unread
              </button>
              <button
                type="button"
                onClick={() => {
                  setArchiveFilter("archived");
                  setReadFilter("all");
                }}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-semibold",
                  archiveFilter === "archived" && readFilter === "all"
                    ? "bg-surface-strong text-foreground"
                    : "text-muted hover:bg-surface"
                )}
              >
                Archived
              </button>
              <button
                type="button"
                onClick={() => {
                  setArchiveFilter("all");
                  setReadFilter("all");
                }}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-semibold",
                  archiveFilter === "all" && readFilter === "all"
                    ? "bg-surface-strong text-foreground"
                    : "text-muted hover:bg-surface"
                )}
              >
                All mail
              </button>
            </div>

            <div className="hidden items-center gap-2 text-xs text-muted sm:flex">
              {lastSync?.since ? (
                <span>Last sync: {new Date(lastSync.since).toLocaleString()}</span>
              ) : null}
              {searchQuery.trim().length ? <span>• search: “{searchQuery.trim()}”</span> : null}
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted">No messages match your filters.</div>
          ) : (
            <div className="rounded-2xl border border-border-soft bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-border-soft px-5 py-3 sm:px-6">
                <div className="text-sm font-semibold text-muted">
                  {messages.length} {view === "threads" ? "threads" : "messages"}
                </div>
                <div className="hidden text-xs text-muted sm:block">Click a row to open • Hover for actions</div>
              </div>

              <div>
                {messages.map((m) => {
                  const from = parseFrom(m.fromAddress);
                  const dateText = m.date ? new Date(m.date).toLocaleString() : "";
                  const providerLabel = m.provider === "google" ? "Gmail" : m.provider;
                  const threadCount = typeof m.threadCount === "number" ? m.threadCount : 1;
                  const unreadCount = typeof m.unreadCount === "number" ? m.unreadCount : 0;

                  return (
                    <div
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/inbox/${m.id}`)}
                      onMouseEnter={() => {
                        if (prefetched.current.has(m.id)) return;
                        prefetched.current.add(m.id);
                        router.prefetch(`/inbox/${m.id}`);
                        prefetchBody(m.id);
                      }}
                      onTouchStart={() => {
                        if (prefetched.current.has(m.id)) return;
                        prefetched.current.add(m.id);
                        router.prefetch(`/inbox/${m.id}`);
                        prefetchBody(m.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") router.push(`/inbox/${m.id}`);
                      }}
                      className={cn(
                        "group flex cursor-pointer items-center gap-3 border-b border-border-soft px-5 py-3 outline-none transition-colors hover:bg-surface-strong last:border-b-0 sm:px-6",
                        !m.isRead && "bg-background/30"
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold text-foreground">
                        {from.avatar}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="grid min-w-0 grid-cols-1 items-baseline gap-2 sm:grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr]">
                          <span
                            className={cn(
                              "truncate text-sm",
                              m.isRead ? "text-foreground/80" : "font-semibold text-foreground"
                            )}
                          >
                            {from.display}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-baseline gap-2">
                              <span
                                className={cn(
                                  "truncate text-sm",
                                  m.isRead
                                    ? "text-foreground/80"
                                    : "font-semibold text-foreground"
                                )}
                              >
                                {m.subject || "(No subject)"}
                              </span>
                              {threadCount > 1 ? (
                                <span className="shrink-0 text-xs font-semibold text-muted">
                                  ({threadCount})
                                </span>
                              ) : null}
                              {view === "threads" && unreadCount > 0 ? (
                                <span className="shrink-0 text-xs font-semibold text-muted">
                                  • {unreadCount} unread
                                </span>
                              ) : null}
                              <span className="hidden min-w-0 truncate text-sm text-muted sm:inline">
                                — {m.snippet || ""}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                              <Badge tone="info" soft>
                                {providerLabel}
                              </Badge>
                              <span>{m.isArchived ? "Archived" : "Inbox"}</span>
                              <span>•</span>
                              <span>{m.isRead ? "Read" : "Unread"}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            "whitespace-nowrap text-xs",
                            m.isRead ? "text-muted" : "font-semibold text-foreground"
                          )}
                        >
                          {dateText}
                        </span>

                        <div className="hidden items-center gap-1 group-hover:flex">
                          <IconPillButton
                            label={m.isRead ? "Mark as unread" : "Mark as read"}
                            disabled={loading}
                            onClick={(e) => {
                              e.stopPropagation();
                              actOnMessage(m.id, m.isRead ? "markUnread" : "markRead");
                            }}
                          >
                            {m.isRead ? (
                              <Mail className="h-4 w-4" />
                            ) : (
                              <MailOpen className="h-4 w-4" />
                            )}
                          </IconPillButton>

                          <IconPillButton
                            label={m.isArchived ? "Move to inbox" : "Archive"}
                            disabled={loading}
                            onClick={(e) => {
                              e.stopPropagation();
                              actOnMessage(m.id, m.isArchived ? "unarchive" : "archive");
                            }}
                          >
                            {m.isArchived ? (
                              <Inbox className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </IconPillButton>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
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
    </div>
  );
}


