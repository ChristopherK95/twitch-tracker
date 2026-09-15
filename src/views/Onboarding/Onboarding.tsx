import { useEffect, useRef, useState } from "react";
import { commands, openInBrowser, type AuthStatus, type ChannelSearchResult } from "../../lib/tauri";
import mascotMark from "../../assets/mascot.png";
import { PlugIcon, SearchIcon } from "../../components/icons";
import "./Onboarding.css";

function initials(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
}
function hueFor(userId: number): number {
  return userId % 360;
}

/**
 * First-run step 1 (.scratch/twitchtrack-v1-spec/issues/08-onboarding-prototype.md):
 * launch goes straight here — no empty Watchlist shown first — for anyone who's never
 * connected a Twitch account before (see App.tsx's gating condition).
 */
export function ConnectStep({ authStatus }: { authStatus: AuthStatus }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await commands.startConnectFlow();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <img src={mascotMark} alt="" className="onboarding-mascot" />
        <h1>Welcome to TwitchTrack</h1>
        {authStatus.status === "connecting" ? (
          <>
            <p className="subtitle subtitle--inline">
              Go to{" "}
              <button className="link-btn" onClick={() => openInBrowser(authStatus.verification_uri)}>
                {authStatus.verification_uri}
              </button>{" "}
              and confirm this code:
            </p>
            <div className="code-box">{authStatus.user_code}</div>
            <div className="waiting-note">
              <span className="spinner" />
              Waiting for approval…
            </div>
          </>
        ) : (
          <>
            <p className="subtitle">
              Connect your Twitch account so TwitchTrack can check on the streamers you want to
              keep an eye on.
            </p>
            <button className="btn-primary" onClick={connect} disabled={busy}>
              <PlugIcon size={16} />
              Connect your Twitch account
            </button>
            {error && <div className="error">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * First-run step 2: shown once connected, while the Watchlist is still empty. "Skip for
 * now" is deliberately not persisted — it's a per-session dismissal, not a permanent one,
 * per the ticket's resolution.
 */
export function AddFirstStreamerStep({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChannelSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) {
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
  }, [query]);

  async function addStreamer(result: ChannelSearchResult) {
    await commands.addWatchedStreamer({
      user_id: result.user_id,
      login: result.login,
      display_name: result.display_name,
      profile_image_url: result.thumbnail_url || null,
    });
    onDone();
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1>Track your first streamer</h1>
        <p className="subtitle">Search for a Twitch channel to start watching for when they go live.</p>
        <div className="search-row" onClick={() => searchInputRef.current?.focus()}>
          <SearchIcon size={16} className="search-row-icon" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search for a streamer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {results.length > 0 && (
            <div className="search-results">
              {results.map((r) => (
                <div className="search-hit" key={r.user_id} onClick={() => addStreamer(r)}>
                  <div className="avatar" style={{ background: `hsl(${hueFor(r.user_id)} 55% 46%)` }}>
                    {initials(r.display_name)}
                  </div>
                  <span>{r.display_name}</span>
                  <span className="spacer" />
                  <span className="track-chip">TRACK</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <div className="error">{error}</div>}
        <button className="skip-link" onClick={onDone}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
