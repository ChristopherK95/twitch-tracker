import { useState } from "react";
import type { AuthStatus } from "../lib/tauri";
import { commands } from "../lib/tauri";
import "./ConnectBanner.css";

/**
 * Temporary, minimal stand-in for the real "Connect your Twitch account" UI —
 * the actual chosen design lives in the Settings "Card Dashboard"
 * (.scratch/twitchtrack-v1-spec/issues/06-settings-lifecycle-prototype.md) and
 * a proper Settings view lands in milestone 4. This exists now purely so
 * milestone 2's auth flow is reachable/testable.
 */
export function ConnectBanner({ status }: { status: AuthStatus }) {
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

  async function disconnect() {
    await commands.disconnect();
  }

  if (status.status === "connected") {
    return (
      <div className="connect-banner connect-banner--connected">
        <span>Connected as <b>{status.login}</b></span>
        <button className="link-btn" onClick={disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  if (status.status === "connecting") {
    return (
      <div className="connect-banner">
        <div>
          Go to <b>{status.verification_uri}</b> and enter this code:
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
