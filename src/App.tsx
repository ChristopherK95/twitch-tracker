import { useEffect, useState } from "react";
import { Watchlist } from "./views/Watchlist/Watchlist";
import { NotificationLog } from "./views/NotificationLog/NotificationLog";
import { Settings } from "./views/Settings/Settings";
import { ConnectBanner } from "./views/ConnectBanner";
import { PollTimer } from "./components/PollTimer";
import {
  commands,
  onAuthStatusChanged,
  onLiveStateUpdated,
  onNotificationCreated,
  type AuthStatus,
} from "./lib/tauri";
import "./theme/tokens.css";
import "./App.css";

type View = "watchlist" | "notifications" | "settings";

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ status: "disconnected" });
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [view, setView] = useState<View>("watchlist");
  const [highlightUserId, setHighlightUserId] = useState<number | null>(null);

  useEffect(() => {
    commands.getAuthStatus().then(setAuthStatus);
    const unlistenAuth = onAuthStatusChanged((status) => {
      setAuthStatus(status);
      setRefreshSignal((k) => k + 1);
    });
    const unlistenNotif = onNotificationCreated((userId) => {
      setHighlightUserId(userId);
      setRefreshSignal((k) => k + 1);
    });
    const unlistenLive = onLiveStateUpdated(() => {
      setRefreshSignal((k) => k + 1);
    });
    return () => {
      unlistenAuth.then((f) => f());
      unlistenNotif.then((f) => f());
      unlistenLive.then((f) => f());
    };
  }, []);

  return (
    <main>
      <div className="topbar">
        <div className="wordmark">
          <span className="dot" />
          TwitchTrack
        </div>
        <nav className="view-nav">
          <button className={view === "watchlist" ? "active" : ""} onClick={() => setView("watchlist")}>
            Watchlist
          </button>
          <button className={view === "notifications" ? "active" : ""} onClick={() => setView("notifications")}>
            Notifications
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            Settings
          </button>
        </nav>
        <PollTimer />
      </div>
      {authStatus.status !== "connected" && <ConnectBanner status={authStatus} />}
      {view === "watchlist" && (
        <Watchlist
          refreshSignal={refreshSignal}
          canSearch={authStatus.status === "connected"}
          onStreamerAdded={() => setRefreshSignal((k) => k + 1)}
          highlightUserId={highlightUserId}
        />
      )}
      {view === "notifications" && (
        <NotificationLog refreshSignal={refreshSignal} highlightUserId={highlightUserId} />
      )}
      {view === "settings" && <Settings authStatus={authStatus} />}
    </main>
  );
}

export default App;
