import { useEffect, useRef, useState } from "react";
import { commands, type ChannelSearchResult, type WatchlistEntry } from "../../lib/tauri";
import "./Watchlist.css";

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

interface WatchlistProps {
  canSearch: boolean;
  onStreamerAdded: () => void;
  highlightUserId: number | null;
  refreshSignal: number;
}

export function Watchlist({ canSearch, onStreamerAdded, highlightUserId, refreshSignal }: WatchlistProps) {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChannelSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    commands.getWatchlist().then(setEntries).catch((e) => setError(String(e)));
  }, [refreshSignal]);

  useEffect(() => {
    if (highlightUserId === null) return;
    rowRefs.current.get(highlightUserId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [entries, highlightUserId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!canSearch || query.trim().length === 0) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      commands
        .searchChannels(query.trim())
        .then(setResults)
        .catch((e) => setError(String(e)));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, canSearch]);

  async function addStreamer(result: ChannelSearchResult) {
    await commands.addWatchedStreamer({
      user_id: result.user_id,
      login: result.login,
      display_name: result.display_name,
      profile_image_url: result.thumbnail_url || null,
    });
    setQuery("");
    setResults([]);
    onStreamerAdded();
  }

  async function openStream(userId: number, login: string) {
    await commands.openStream(userId, login);
    // click_count changed, which affects live-ranking order — refresh to reflect it.
    commands.getWatchlist().then(setEntries).catch((e) => setError(String(e)));
  }

  const live = entries.filter((e) => e.is_live);
  const offline = entries.filter((e) => !e.is_live);

  return (
    <div className="watchlist">
      <div className="search-row">
        <input
          type="text"
          placeholder={
            canSearch ? "Search for a streamer to track…" : "Connect your Twitch account to search"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!canSearch}
        />
        {results.length > 0 && (
          <div className="search-results">
            {results.map((r) => (
              <div className="search-hit" key={r.user_id} onClick={() => addStreamer(r)}>
                <Avatar userId={r.user_id} displayName={r.display_name} imageUrl={r.thumbnail_url || null} />
                <span>{r.display_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="row-faint">{error}</p>}

      <h2 className="section-heading">Live now — {live.length}</h2>
      {live.map((s) => (
        <div
          className={`row ${s.user_id === highlightUserId ? "row--highlighted" : ""}`}
          key={s.user_id}
          ref={(el) => {
            if (el) rowRefs.current.set(s.user_id, el);
            else rowRefs.current.delete(s.user_id);
          }}
        >
          <div className="thumb">
            {s.stream_thumbnail_url && (
              <img
                src={s.stream_thumbnail_url}
                alt=""
                className="thumb-img"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="viewers-chip">{s.view_count?.toLocaleString("en-US")}</div>
          </div>
          <div className="row-main">
            <div className="row-top">
              <Avatar userId={s.user_id} displayName={s.display_name} imageUrl={s.profile_image_url} small />
              <button className="name-btn" onClick={() => openStream(s.user_id, s.login)}>
                {s.display_name}
              </button>
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
        <div
          className={`row ${s.user_id === highlightUserId ? "row--highlighted" : ""}`}
          key={s.user_id}
          ref={(el) => {
            if (el) rowRefs.current.set(s.user_id, el);
            else rowRefs.current.delete(s.user_id);
          }}
        >
          <Avatar userId={s.user_id} displayName={s.display_name} imageUrl={s.profile_image_url} />
          <div className="row-main">
            <div className="row-top">
              <button className="name-btn" onClick={() => openStream(s.user_id, s.login)}>
                {s.display_name}
              </button>
            </div>
            <div className="row-faint">{formatLastLive(s.last_live_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Avatar({
  userId,
  displayName,
  imageUrl,
  small,
}: {
  userId: number;
  displayName: string;
  imageUrl: string | null;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const className = `avatar ${small ? "avatar--small" : ""}`;
  if (imageUrl && !failed) {
    return (
      <img src={imageUrl} alt="" className={`${className} avatar-img`} onError={() => setFailed(true)} />
    );
  }
  return (
    <div className={className} style={{ background: `hsl(${hueFor(userId)} 55% 46%)` }}>
      {initials(displayName)}
    </div>
  );
}
