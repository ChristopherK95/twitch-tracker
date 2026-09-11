import { useEffect, useState } from "react";
import { Watchlist } from "./views/Watchlist/Watchlist";
import { ConnectBanner } from "./views/ConnectBanner";
import { commands, onAuthStatusChanged, type AuthStatus } from "./lib/tauri";
import "./theme/tokens.css";
import "./App.css";

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ status: "disconnected" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    commands.getAuthStatus().then(setAuthStatus);
    const unlisten = onAuthStatusChanged((status) => {
      setAuthStatus(status);
      // A status change (e.g. just connected) is exactly when the Watchlist's
      // live data is worth re-fetching.
      setRefreshKey((k) => k + 1);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <main>
      <div className="topbar">
        <div className="wordmark">
          <span className="dot" />
          TwitchTrack
        </div>
      </div>
      <ConnectBanner status={authStatus} />
      <Watchlist
        key={refreshKey}
        canSearch={authStatus.status === "connected"}
        onStreamerAdded={() => setRefreshKey((k) => k + 1)}
      />
    </main>
  );
}

export default App;
