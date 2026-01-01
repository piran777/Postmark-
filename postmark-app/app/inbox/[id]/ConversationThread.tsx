"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
    // If we only have 0/1 message locally, try hydrating the rest silently.
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

  if (items.length <= 1) return null;

  return (
    <div className="border-t border-border/70 px-5 py-4 sm:px-6">
      <div className="mb-2 text-xs font-semibold text-muted">Conversation</div>
      <div className="space-y-2">
        {items.map((t) => {
          const isCurrent = t.id === props.currentId;
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
                      <span className="shrink-0 text-xs font-semibold text-muted">Viewing</span>
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
  );
}


