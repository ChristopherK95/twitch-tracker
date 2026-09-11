import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./Watchlist.css";

/**
 * Mirrors src-tauri/src/commands.rs::WatchlistEntry. Live fields are mocked until
 * milestone 3's polling scheduler exists — see mock_live_state.rs.
 */
interface WatchlistEntry {
  user_id: number;
  login: string;
  display_name: string;
  profile_image_url: string | null;
  click_count: number;
  last_live_at: number | null;
  is_live: boolean;
  category: string | null;
  title: string | null;
  view_count: number | null;
  started_at: number | null;
}

function initials(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
}

function hueFor(userId: number): number {
  return userId % 360;
}

function formatElapsed(startedAt: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - startedAt) / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function formatLastLive(lastLiveAt: number | null): string {
  if (lastLiveAt === null) return "not yet live";
  const days = Math.floor((Date.now() / 1000 - lastLiveAt) / 86400);
  if (days <= 0) return "last live today";
  if (days === 1) return "last live yesterday";
  return `last live ${days} days ago`;
}

export function Watchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<WatchlistEntry[]>("get_watchlist")
      .then(setEntries)
      .catch((e) => setError(String(e)));
  }, []);

  const live = entries.filter((e) => e.is_live);
  const offline = entries.filter((e) => !e.is_live);

  return (
    <div className="watchlist">
      <div className="search-row">
        <input type="text" placeholder="Search for a streamer to track…" disabled />
      </div>

      {error && <p className="row-faint">Couldn't load your Watchlist: {error}</p>}

      <h2 className="section-heading">Live now — {live.length}</h2>
      {live.map((s) => (
        <div className="row" key={s.user_id}>
          <div className="thumb">
            <div className="viewers-chip">{s.view_count?.toLocaleString("en-US")}</div>
          </div>
          <div className="row-main">
            <div className="row-top">
              <button className="name-btn">{s.display_name}</button>
              <span className="category-pill">{s.category}</span>
            </div>
            <div className="row-title">{s.title}</div>
            <div className="row-stats">
              <span>{s.started_at ? formatElapsed(s.started_at) : ""} elapsed</span>
            </div>
          </div>
        </div>
      ))}

      <h2 className="section-heading">Offline — {offline.length}</h2>
      {offline.map((s) => (
        <div className="row" key={s.user_id}>
          <div className="avatar" style={{ background: `hsl(${hueFor(s.user_id)} 55% 46%)` }}>
            {initials(s.display_name)}
          </div>
          <div className="row-main">
            <div className="row-top">
              <button className="name-btn">{s.display_name}</button>
            </div>
            <div className="row-faint">{formatLastLive(s.last_live_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
