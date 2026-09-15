import type { NotificationCreatedEvent } from "../lib/tauri";
import { QuoteIcon, TagIcon } from "./icons";
import "./Toast.css";

export interface ToastItem {
  id: number;
  event: NotificationCreatedEvent;
}

function ToastIcon({ event }: { event: NotificationCreatedEvent }) {
  if (event.event_type === "go_live") return <span className="toast-mark toast-mark--live" />;
  if (event.event_type === "go_offline") return <span className="toast-mark toast-mark--offline" />;
  return (
    <span className="toast-mark toast-mark--change">
      {event.old_title !== null ? <QuoteIcon size={13} /> : <TagIcon size={13} />}
    </span>
  );
}

function toastText(event: NotificationCreatedEvent): string {
  if (event.event_type === "go_live") return `is live — ${event.category}`;
  if (event.event_type === "go_offline") return "went offline";
  return event.old_title !== null ? "changed their title" : "changed category";
}

const LIFETIME_MS = 6000;

export function ToastStack({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
  onOpen: (event: NotificationCreatedEvent) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onClick={() => onOpen(t.event)}>
          <ToastIcon event={t.event} />
          <div className="toast-body">
            <div className="toast-name">{t.event.display_name}</div>
            <div className="toast-text">{toastText(t.event)}</div>
          </div>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(t.id);
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
          <div className="toast-progress" style={{ animationDuration: `${LIFETIME_MS}ms` }} />
        </div>
      ))}
    </div>
  );
}

export { LIFETIME_MS };
