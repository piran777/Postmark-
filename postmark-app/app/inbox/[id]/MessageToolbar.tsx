"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Archive,
  Inbox,
  Mail,
  MailOpen,
  RefreshCcw,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  messageId: string;
  isRead: boolean;
  isArchived: boolean;
  threadCount?: number;
};

function IconButton(props: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      aria-label={props.label}
      className="h-9 w-9 rounded-full p-0"
    >
      {props.children}
    </Button>
  );
}

export function MessageToolbar({ messageId, isRead, isArchived }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [localRead, setLocalRead] = useState(isRead);
  const [localArchived, setLocalArchived] = useState(isArchived);
  const [applyToThread, setApplyToThread] = useState(true);

  const markLabel = useMemo(
    () => (localRead ? "Mark as unread" : "Mark as read"),
    [localRead]
  );
  const archiveLabel = useMemo(
    () => (localArchived ? "Move to Inbox" : "Archive"),
    [localArchived]
  );

  async function act(action: "markRead" | "markUnread" | "archive" | "unarchive") {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, applyToThread }),
      });
      if (!res.ok) {
        // Keep it simple for now; inbox page already shows detailed error banners.
        // Here we just refresh so the user sees the real state.
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      const item = data?.item;
      if (typeof item?.isRead === "boolean") setLocalRead(item.isRead);
      if (typeof item?.isArchived === "boolean") setLocalArchived(item.isArchived);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <IconButton label="Back to inbox" disabled={loading}>
          <Link href="/inbox" aria-label="Back to inbox">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </IconButton>

        <div className="h-6 w-px bg-border/70" />

        <IconButton
          label={archiveLabel}
          disabled={loading}
          onClick={() => act(localArchived ? "unarchive" : "archive")}
        >
          {localArchived ? <Inbox className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </IconButton>

        <IconButton
          label={markLabel}
          disabled={loading}
          onClick={() => act(localRead ? "markUnread" : "markRead")}
        >
          {localRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
        </IconButton>

        <IconButton label="Refresh" disabled={loading} onClick={() => router.refresh()}>
          <RefreshCcw className="h-4 w-4" />
        </IconButton>

        <IconButton label="Delete (coming soon)" disabled>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 rounded-full px-3 text-xs"
          disabled={loading}
          onClick={() => setApplyToThread((v) => !v)}
          title="Toggle whether actions apply to the whole conversation"
        >
          {applyToThread ? "Conversation" : "Message"}
        </Button>
      </div>
    </div>
  );
}




