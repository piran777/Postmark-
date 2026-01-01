"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

type Body = { html: string | null; text: string | null } | null;

export function MessageBody(props: { messageId: string; fallbackText?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState<Body>(null);
  const [timedOut, setTimedOut] = useState(false);

  const fallback = useMemo(() => props.fallbackText || null, [props.fallbackText]);

  const cacheKey = useMemo(() => `pm:messageBody:${props.messageId}`, [props.messageId]);

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = Boolean(opts?.force);
      setTimedOut(false);

      // Cache first (fast back/forward)
      if (!force) {
        try {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as Body;
            if (parsed && (parsed.html || parsed.text)) {
              setBody(parsed);
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        setTimedOut(true);
        controller.abort();
      }, 2500);

      setLoading(true);
      try {
        const res = await fetch(`/api/messages/${props.messageId}?includeBody=true`, {
          method: "GET",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        const next = (data?.item?.body ?? null) as Body;
        setBody(next);
        try {
          if (next && (next.html || next.text)) {
            sessionStorage.setItem(cacheKey, JSON.stringify(next));
          }
        } catch {
          // ignore
        }
      } catch {
        // Keep fallback text visible; only stop loading.
      } finally {
        window.clearTimeout(timeout);
        setLoading(false);
      }
    },
    [cacheKey, props.messageId]
  );

  // Start loading in the background, but don't block the UI with a huge skeleton.
  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border/70 bg-background/40 px-4 py-4 text-sm text-foreground">
        {/* Gmail-ish: indeterminate bar + small spinner */}
        <div className="mb-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-foreground/40" />
          </div>
        </div>

        {fallback ? (
          <div className="whitespace-pre-wrap">{fallback}</div>
        ) : (
          <div className="text-muted">Loading…</div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading full message…
          </span>
          <button
            type="button"
            className="rounded-md border border-border bg-surface px-2 py-1 font-semibold text-muted hover:bg-surface-strong"
            onClick={() => load({ force: true })}
          >
            Retry now
          </button>
        </div>
      </div>
    );
  }

  if (body?.html) {
    return (
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
</style></head><body>${body.html}</body></html>`}
        />
      </div>
    );
  }

  const text = body?.text || fallback;
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 px-4 py-4 text-sm text-foreground">
      {text ? (
        <div className="whitespace-pre-wrap">{text}</div>
      ) : (
        <div className="text-muted">No body available.</div>
      )}

      {timedOut ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
          <span>Full message is taking longer than usual.</span>
          <button
            type="button"
            className="rounded-md border border-border bg-surface px-2 py-1 font-semibold text-muted hover:bg-surface-strong"
            onClick={() => load({ force: true })}
          >
            Load full message
          </button>
        </div>
      ) : null}
    </div>
  );
}


