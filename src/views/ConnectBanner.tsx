import type { AuthStatus } from "../lib/tauri";
import { TriangleAlertIcon } from "../components/icons";
import "./ConnectBanner.css";

/**
 * Persistent reminder shown whenever not connected (App.tsx only renders this outside
 * the "connected" state) — one of the three disconnected-state surfaces from
 * .scratch/twitchtrack-v1-spec/issues/04-error-handling.md (alongside the tray tooltip
 * and the one-time desktop notification). It's deliberately non-interactive — the
 * actual connect flow lives entirely in Settings ("Card Dashboard",
 * issues/06-settings-lifecycle-prototype.md).
 */
export function ConnectBanner({ status }: { status: Exclude<AuthStatus, { status: "connected" }> }) {
  return (
    <div className="connect-banner">
      <TriangleAlertIcon size={15} />
      <span>
        {status.status === "connecting"
          ? "Connecting to Twitch — finish signing in from Settings."
          : "Twitch account disconnected — reconnect in Settings."}
      </span>
    </div>
  );
}
