"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";

type Item = {
  id: string;
  subject: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  date: string | null;
  snippet: string | null;
  isRead: boolean;
  isArchived: boolean;
};

type Body = { html: string | null; text: string | null } | null;

function stripScripts(html: string) {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

function CollapsibleMessage(props: { item: Item }) {
  const { item } = props;
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<Body>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  const dateText = item.date
    ? new Date(item.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  // Extract just the name part from email address
  const senderName = useMemo(() => {
    const addr = item.fromAddress || "Unknown";
    const match = addr.match(/^([^<]+)</);
    if (match) return match[1].trim();
    return addr.split("@")[0];
  }, [item.fromAddress]);

  const loadBody = useCallback(async () => {
    if (body) return; // already loaded
    setLoadingBody(true);
    try {
      const res = await fetch(`/api/messages/${item.id}?includeBody=true`);
      const data = await res.json().catch(() => ({}));
      setBody(data?.item?.body ?? null);
    } catch {
      // ignore
    } finally {
      setLoadingBody(false);
    }
  }, [body, item.id]);

  // Load body when expanded
  useEffect(() => {
    if (expanded && !body && !loadingBody) {
      loadBody();
    }
  }, [expanded, body, loadingBody, loadBody]);

  return (
    <div
      className={[
        "rounded-xl border transition-all duration-200",
        expanded 
          ? "border-border bg-surface shadow-sm" 
          : "border-border/40 bg-surface/30 hover:border-border/70 hover:bg-surface/50",
      ].join(" ")}
    >
      {/* Collapsed header - always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold text-foreground">
          {senderName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {senderName}
          </div>
          {!expanded && (
            <div className="mt-0.5 truncate text-xs text-muted">
              {item.snippet || "(No preview)"}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
          <span className="hidden sm:inline">{dateText}</span>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3">
          <div className="mb-3 flex items-center justify-between text-xs text-muted">
            <span>To: {item.toAddress || "Unknown"}</span>
            <span className="sm:hidden">{dateText}</span>
          </div>
          {loadingBody ? (
            <div className="rounded-xl bg-white p-4 text-sm text-gray-500">
              Loading message…
            </div>
          ) : body?.html ? (
            <iframe
              title={`Message from ${senderName}`}
              sandbox=""
              className="h-[300px] w-full rounded-xl"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" />
<style>
  :root { color-scheme: light; }
  html, body { background: #ffffff; color: #1a1a1a; margin: 0; padding: 12px; }
  body { font: 13px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #1a73e8; }
</style></head><body>${stripScripts(body.html)}</body></html>`}
            />
          ) : (
            <div className="rounded-xl bg-white p-4 text-sm text-gray-800 whitespace-pre-wrap">
              {body?.text || item.snippet || "No content available."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConversationThread(props: {
  currentId: string;
  messageId: string;
  provider: string;
  threadId: string | null;
  emailAccountId: string;
  initial: Item[];
}) {
  const [items, setItems] = useState<Item[]>(props.initial);

  const shouldHydrate = useMemo(() => {
    if (props.provider !== "google") return false;
    if (!props.threadId) return false;
    return items.length <= 1;
  }, [items.length, props.provider, props.threadId]);

  useEffect(() => {
    setItems(props.initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.messageId]);

  useEffect(() => {
    if (!shouldHydrate) return;
    const key = `pm:threadHydrated:${props.emailAccountId}:${props.threadId}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
    } catch {
      // ignore
    }

    let cancelled = false;

    async function run() {
      try {
        await fetch("/api/threads/hydrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageId: props.messageId }),
        });
        const res = await fetch(
          `/api/messages/${props.messageId}?includeConversation=true`,
          { method: "GET" }
        );
        const data = await res.json().catch(() => ({}));
        const next = (data?.item?.conversation?.items || []) as Item[];
        if (!cancelled && Array.isArray(next) && next.length) setItems(next);
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [props.emailAccountId, props.messageId, props.threadId, shouldHydrate]);

  // Filter out the current message - it's already shown above
  const otherMessages = items.filter((t) => t.id !== props.currentId);

  // Don't show section if there are no other messages
  if (otherMessages.length === 0) return null;

  return (
    <div>
      <div className="mb-3 text-xs font-medium text-muted">
        {otherMessages.length} other message{otherMessages.length !== 1 ? "s" : ""} in this thread
      </div>
      <div className="space-y-2">
        {otherMessages.map((t) => (
          <CollapsibleMessage key={t.id} item={t} />
        ))}
      </div>
    </div>
  );
}




