import { useEffect, useRef, useState } from "react";
import { commands, type ChannelSearchResult, type WatchlistEntry } from "../../lib/tauri";
import { ArrowUpRightIcon, EyeIcon, PlusIcon, SearchIcon } from "../../components/icons";
import "./Watchlist.css";

const FRESH_THRESHOLD_SECONDS = 5 * 60;

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

// Twitch's own search ranking doesn't reliably put an exact name match first (a live,
// loosely-related channel can easily outrank it) — so re-sort a perfect match for what
// was typed to the top, keeping Twitch's relative order everywhere else.
function sortExactMatchFirst(results: ChannelSearchResult[], query: string): ChannelSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return results;
  const isExact = (r: ChannelSearchResult) => r.display_name.toLowerCase() === q || r.login.toLowerCase() === q;
  return [...results.filter(isExact), ...results.filter((r) => !isExact(r))];
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
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    const trimmed = query.trim();
    debounceRef.current = setTimeout(() => {
      commands
        .searchChannels(trimmed)
        .then((r) => {
          setResults(sortExactMatchFirst(r, trimmed));
          setActiveIndex(0);
        })
        .catch((e) => setError(String(e)));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, canSearch]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) addStreamer(target);
    } else if (e.key === "Escape") {
      setResults([]);
    }
  }

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
        <div className="search-input" onClick={() => searchInputRef.current?.focus()}>
          <SearchIcon size={16} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={
              canSearch ? "Search for a streamer to track…" : "Connect your Twitch account to search"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            disabled={!canSearch}
          />
          <kbd className="search-shortcut">⌘K</kbd>
        </div>
        {results.length > 0 && (
          <div className="search-results">
            {results.map((r, i) => (
              <div
                className={`search-hit ${i === activeIndex ? "search-hit--active" : ""}`}
                key={r.user_id}
                onClick={() => addStreamer(r)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <Avatar userId={r.user_id} displayName={r.display_name} imageUrl={r.thumbnail_url || null} />
                <span>{r.display_name}</span>
                <span className="spacer" />
                <span className="track-chip">
                  <PlusIcon size={11} />
                  TRACK
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="row-faint">{error}</p>}

      <div className="section">
        <div className="section-heading section-heading--live">
          <span className="status-dot" />
          LIVE NOW
          <span className="count-badge count-badge--live">{live.length}</span>
          <span className="rule" />
        </div>
        <div className="live-list">
          {live.map((s) => {
            const fresh = s.started_at !== null && Date.now() / 1000 - s.started_at < FRESH_THRESHOLD_SECONDS;
            return (
              <div
                className={`row row--live ${fresh ? "row--fresh" : ""} ${
                  s.user_id === highlightUserId ? "row--highlighted" : ""
                }`}
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
                  <div className="live-tag">
                    <span className="pulse-dot" />
                    LIVE
                  </div>
                  <div className="viewers-chip">
                    <EyeIcon size={11} />
                    {s.view_count?.toLocaleString("en-US")}
                  </div>
                </div>
                <div className="row-main">
                  <div className="row-top">
                    <Avatar userId={s.user_id} displayName={s.display_name} imageUrl={s.profile_image_url} small />
                    <button className="name-btn" onClick={() => openStream(s.user_id, s.login)}>
                      {s.display_name}
                    </button>
                    <button className="open-btn" onClick={() => openStream(s.user_id, s.login)} title="Open stream">
                      <ArrowUpRightIcon size={12} />
                    </button>
                    {s.category && <span className="category-pill">{s.category}</span>}
                    <span className="spacer" />
                    {fresh && <span className="fresh-tag">JUST WENT LIVE</span>}
                  </div>
                  <div className="row-title">{s.title}</div>
                  <div className="row-stats">
                    <span>{s.started_at ? formatElapsed(s.started_at) : ""} elapsed</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-heading">
          OFFLINE
          <span className="count-badge">{offline.length}</span>
          <span className="rule" />
        </div>
        <div className="offline-list">
          {offline.map((s) => (
            <div
              className={`row row--offline ${s.user_id === highlightUserId ? "row--highlighted" : ""}`}
              key={s.user_id}
              ref={(el) => {
                if (el) rowRefs.current.set(s.user_id, el);
                else rowRefs.current.delete(s.user_id);
              }}
            >
              <Avatar userId={s.user_id} displayName={s.display_name} imageUrl={s.profile_image_url} dim />
              <button className="name-btn name-btn--muted" onClick={() => openStream(s.user_id, s.login)}>
                {s.display_name}
              </button>
              <button className="open-btn open-btn--faint" onClick={() => openStream(s.user_id, s.login)} title="Open channel">
                <ArrowUpRightIcon size={11} />
              </button>
              <span className="spacer" />
              <span className="row-faint">{formatLastLive(s.last_live_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Avatar({
  userId,
  displayName,
  imageUrl,
  small,
  dim,
}: {
  userId: number;
  displayName: string;
  imageUrl: string | null;
  small?: boolean;
  dim?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const className = `avatar ${small ? "avatar--small" : ""} ${dim ? "avatar--dim" : ""}`;
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
