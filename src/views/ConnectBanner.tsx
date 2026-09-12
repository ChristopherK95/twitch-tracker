import { useState } from "react";
import type { AuthStatus } from "../lib/tauri";
import { commands, openInBrowser } from "../lib/tauri";
import "./ConnectBanner.css";

/**
 * Persistent reminder shown whenever not connected (App.tsx only renders this outside
 * the "connected" state) — one of the three disconnected-state surfaces from
 * .scratch/twitchtrack-v1-spec/issues/04-error-handling.md (alongside the tray tooltip
 * and the one-time desktop notification). Full account management lives in Settings
 * ("Card Dashboard", issues/06-settings-lifecycle-prototype.md).
 */
export function ConnectBanner({ status }: { status: Exclude<AuthStatus, { status: "connected" }> }) {
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

  if (status.status === "connecting") {
    return (
      <div className="connect-banner">
        <div>
          Go to{" "}
          <button className="link-btn" onClick={() => openInBrowser(status.verification_uri)}>
            {status.verification_uri}
          </button>{" "}
          and confirm this code:
        </div>
        <div className="code-box">{status.user_code}</div>
        <div className="faint">Waiting for approval…</div>
      </div>
    );
  }

  return (
    <div className="connect-banner">
      <span>Not connected to Twitch — the Watchlist can't check live status yet.</span>
      <button className="btn-primary" onClick={connect} disabled={busy}>
        Connect your Twitch account
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
