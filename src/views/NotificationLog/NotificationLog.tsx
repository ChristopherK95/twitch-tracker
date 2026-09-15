import { useEffect, useState } from "react";
import { commands, type NotificationRow } from "../../lib/tauri";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ArrowRightIcon, ChevronDownIcon, QuoteIcon, TagIcon, TrashIcon } from "../../components/icons";
import "./NotificationLog.css";

function initials(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
}
function hueFor(userId: number): number {
  return userId % 360;
}
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function formatFullDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function EntryText({ n }: { n: NotificationRow }) {
  if (n.event_type === "go_live") {
    return (
      <>
        is live — {n.category}: {n.title}
      </>
    );
  }
  if (n.event_type === "go_offline") {
    return <>went offline after {formatDuration(n.duration_seconds ?? 0)}</>;
  }

  const titleChanged = n.old_title !== null;
  const categoryChanged = n.old_category !== null;
  return (
    <>
      {titleChanged && <>changed their title — {n.new_title}</>}
      {titleChanged && categoryChanged && " and "}
      {categoryChanged && (
        <span className="category-change">
          {titleChanged ? "category" : "changed category"}
          <span className="category-pill category-pill--old">{n.old_category}</span>
          <ArrowRightIcon size={11} />
          <span className="category-pill category-pill--new">{n.new_category}</span>
        </span>
      )}
    </>
  );
}

function EvtIcon({ n }: { n: NotificationRow }) {
  if (n.event_type === "go_live") return <span className="evt-mark evt-mark--live" />;
  if (n.event_type === "go_offline") return <span className="evt-mark evt-mark--offline" />;
  return (
    <span className="evt-mark evt-mark--change">
      {n.old_title !== null ? <QuoteIcon size={12} /> : <TagIcon size={12} />}
    </span>
  );
}

function Avatar({ userId, displayName, imageUrl }: { userId: number; displayName: string; imageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return <img src={imageUrl} alt="" className="avatar avatar-img" onError={() => setFailed(true)} />;
  }
  return (
    <div className="avatar" style={{ background: `hsl(${hueFor(userId)} 60% 45%)` }}>
      {initials(displayName)}
    </div>
  );
}

const FILTERS: { key: "all" | NotificationRow["event_type"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "go_live", label: "Go-Live" },
  { key: "go_offline", label: "Go-Offline" },
  { key: "metadata_change", label: "Metadata Change" },
];

interface NotificationLogProps {
  highlightUserId: number | null;
  refreshSignal: number;
}

export function NotificationLog({ highlightUserId, refreshSignal }: NotificationLogProps) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [filter, setFilter] = useState<"all" | NotificationRow["event_type"]>("all");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    commands.getNotifications().then(setRows);
  }, [refreshSignal]);

  useEffect(() => {
    if (highlightUserId !== null) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(highlightUserId);
        return next;
      });
    }
  }, [highlightUserId]);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.event_type === filter);

  const byStreamer = new Map<number, NotificationRow[]>();
  for (const r of filtered) {
    const list = byStreamer.get(r.streamer_user_id) ?? [];
    list.push(r);
    byStreamer.set(r.streamer_user_id, list);
  }
  const groups = [...byStreamer.entries()].sort((a, b) => b[1].length - a[1].length);

  function toggleGroup(userId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  async function clearLog() {
    await commands.clearNotifications();
    setRows([]);
    setConfirmingClear(false);
  }

  return (
    <div className="notification-log">
      <div className="toolbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className="toolbar-spacer" />
        {rows.length > 0 && (
          <button className="chip clear-log-btn" onClick={() => setConfirmingClear(true)}>
            <TrashIcon size={12} />
            Clear log
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingClear}
        title="Clear Notification Log?"
        message="This permanently deletes every notification currently in the log. This can't be undone."
        confirmLabel="Clear log"
        destructive
        onConfirm={clearLog}
        onCancel={() => setConfirmingClear(false)}
      />

      {groups.length === 0 && (
        <div className="empty-state">No notifications yet — they'll show up here once a Watched Streamer goes live, offline, or changes their title/category.</div>
      )}

      {groups.map(([userId, entries]) => {
        const displayName = entries[0].streamer_display_name;
        const isCollapsed = collapsed.has(userId);
        return (
          <div className={`group ${isCollapsed ? "collapsed" : ""}`} key={userId}>
            <div className="group-head" onClick={() => toggleGroup(userId)}>
              <Avatar userId={userId} displayName={displayName} imageUrl={entries[0].streamer_profile_image_url} />
              <div className="group-title">{displayName}</div>
              <div className="group-count">
                {entries.length} EVENT{entries.length > 1 ? "S" : ""}
              </div>
              <div className="spacer" />
              <div className="chevron">
                <ChevronDownIcon size={16} />
              </div>
            </div>
            <div className="group-body">
              {entries.map((n) => (
                <div className="entry" key={n.id}>
                  <EvtIcon n={n} />
                  <div className="entry-body">
                    <div className="entry-text">
                      <EntryText n={n} />
                    </div>
                    <div className="entry-time">
                      {formatFullDate(n.created_at)}, {formatTime(n.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {rows.length > 0 && (
        <div className="retention-note">— notifications older than 30 days are pruned automatically —</div>
      )}
    </div>
  );
}
