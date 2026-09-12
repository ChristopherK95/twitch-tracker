import { useEffect, useState } from "react";
import { Watchlist } from "./views/Watchlist/Watchlist";
import { NotificationLog } from "./views/NotificationLog/NotificationLog";
import { Settings } from "./views/Settings/Settings";
import { ConnectBanner } from "./views/ConnectBanner";
import { ConnectStep, AddFirstStreamerStep } from "./views/Onboarding/Onboarding";
import { PollTimer } from "./components/PollTimer";
import {
  commands,
  onAuthStatusChanged,
  onLiveStateUpdated,
  onNotificationCreated,
  type AuthStatus,
  type SettingsRow,
} from "./lib/tauri";
import "./theme/tokens.css";
import "./App.css";

type View = "watchlist" | "notifications" | "settings";

function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="topbar">
      <div className="wordmark">
        <span className="dot" />
        TwitchTrack
      </div>
      {children}
    </div>
  );
}

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ status: "disconnected" });
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [view, setView] = useState<View>("watchlist");
  const [highlightUserId, setHighlightUserId] = useState<number | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [skippedFirstStreamer, setSkippedFirstStreamer] = useState(false);

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

  // twitch_login is set the moment a connect ever succeeds and never cleared again —
  // a reliable "has this install ever completed onboarding" signal, distinct from just
  // being currently disconnected.
  useEffect(() => {
    commands.getSettings().then(setSettings);
  }, [authStatus]);

  useEffect(() => {
    commands.getWatchlist().then((entries) => setWatchlistCount(entries.length));
  }, [refreshSignal]);

  // Don't render anything until we know whether this is a fresh install — avoids a
  // flash of the normal app before flipping into onboarding.
  if (settings === null || watchlistCount === null) {
    return <TopBar />;
  }

  const neverConnectedBefore = settings.twitch_login === null;

  if (neverConnectedBefore && authStatus.status !== "connected") {
    return (
      <main>
        <TopBar />
        <ConnectStep authStatus={authStatus} />
      </main>
    );
  }

  if (authStatus.status === "connected" && watchlistCount === 0 && !skippedFirstStreamer) {
    return (
      <main>
        <TopBar />
        <AddFirstStreamerStep
          onDone={() => {
            setSkippedFirstStreamer(true);
            setRefreshSignal((k) => k + 1);
          }}
        />
      </main>
    );
  }

  return (
    <main>
      <TopBar>
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
      </TopBar>
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
