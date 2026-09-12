import { useEffect, useState } from "react";
import { Watchlist } from "./views/Watchlist/Watchlist";
import { NotificationLog } from "./views/NotificationLog/NotificationLog";
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

// Temporary top-level nav — a proper Settings/nav shell lands in milestone 4/5;
// this just makes the Notification Log reachable in the meantime.
type View = "watchlist" | "notifications";

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
        </nav>
        <PollTimer />
      </div>
      <ConnectBanner status={authStatus} />
      {view === "watchlist" ? (
        <Watchlist
          refreshSignal={refreshSignal}
          canSearch={authStatus.status === "connected"}
          onStreamerAdded={() => setRefreshSignal((k) => k + 1)}
          highlightUserId={highlightUserId}
        />
      ) : (
        <NotificationLog refreshSignal={refreshSignal} highlightUserId={highlightUserId} />
      )}
    </main>
  );
}

export default App;
