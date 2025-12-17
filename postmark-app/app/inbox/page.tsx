"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMessages() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to load messages");
      }
      const data = await res.json();
      setMessages(data.items || []);
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
      const res = await fetch("/api/sync/gmail", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Sync failed");
      }
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
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
    loadMessages();
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
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={loadMessages} disabled={loading}>
              Refresh
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
                    <span className="text-xs text-muted">
                      {m.date ? new Date(m.date).toLocaleString() : ""}
                    </span>
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
      </main>
    </div>
  );
}


