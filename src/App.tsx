import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Watchlist } from "./views/Watchlist/Watchlist";
import { NotificationLog } from "./views/NotificationLog/NotificationLog";
import { Settings } from "./views/Settings/Settings";
import { ConnectBanner } from "./views/ConnectBanner";
import { ConnectStep, AddFirstStreamerStep } from "./views/Onboarding/Onboarding";
import { PollTimer } from "./components/PollTimer";
import { ToastStack, type ToastItem, LIFETIME_MS as TOAST_LIFETIME_MS } from "./components/Toast";
import mascotMark from "./assets/mascot.png";
import { playNotificationSound } from "./lib/sounds";
import {
  commands,
  onAuthStatusChanged,
  onLiveStateUpdated,
  onNotificationCreated,
  type AuthStatus,
  type NotificationCreatedEvent,
  type NotificationKind,
  type SettingsRow,
} from "./lib/tauri";
import "./theme/tokens.css";
import "./App.css";

type View = "watchlist" | "notifications" | "settings";

function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="topbar">
      <div className="wordmark">
        <img src={mascotMark} alt="" className="mascot-mark" />
        TWITCHTRACK
      </div>
      {children}
    </div>
  );
}

const VIEWS: { key: View; label: string }[] = [
  { key: "watchlist", label: "Watchlist" },
  { key: "notifications", label: "Notifications" },
  { key: "settings", label: "Settings" },
];

function ViewNav({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const buttonRefs = useRef<Partial<Record<View, HTMLButtonElement>>>({});
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const measure = (key: View) => {
    const el = buttonRefs.current[key];
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  };

  useLayoutEffect(() => measure(view), [view]);
  // Button widths depend on the display/body webfonts, which can still be loading at
  // mount — re-measure once they're in so the pill doesn't start out misaligned.
  useEffect(() => {
    document.fonts?.ready?.then(() => measure(view));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <nav className="view-nav">
      {pill && (
        <span
          className="view-nav-pill"
          style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
        />
      )}
      {VIEWS.map(({ key, label }) => (
        <button
          key={key}
          ref={(el) => {
            if (el) buttonRefs.current[key] = el;
          }}
          className={view === key ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </nav>
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastId = useRef(0);

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function openToast(event: NotificationCreatedEvent) {
    setView("notifications");
    setHighlightUserId(event.user_id);
  }

  useEffect(() => {
    commands.getAuthStatus().then(setAuthStatus);
    const unlistenAuth = onAuthStatusChanged((status) => {
      setAuthStatus(status);
      setRefreshSignal((k) => k + 1);
    });
    const unlistenNotif = onNotificationCreated((event) => {
      // Scrolling/highlighting the affected row now happens only if the user clicks the
      // toast (see openToast) — doing it unconditionally here used to yank the Watchlist
      // scroll position to wherever that row happened to be for every background event.
      setRefreshSignal((k) => k + 1);
      playNotificationSound(event.event_type);

      const id = ++nextToastId.current;
      setToasts((prev) => [...prev, { id, event }]);
      setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS);
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

  // Dev-only: Ctrl/Cmd+Shift+N simulates a notification round-trip (writes a fake row,
  // emits the same "notification-created" event a real one would) so the sound/highlight
  // reaction can be exercised without waiting for a real Twitch event. The backend command
  // itself also no-ops outside a debug build — import.meta.env.DEV just keeps the listener
  // from existing at all in a production bundle. Listed for humans in Settings' dev-only
  // "Developer" card — see lib/devKeybinds.ts if you add another one here.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const kinds: NotificationKind[] = ["go_live", "go_offline", "metadata_change"];
    let next = 0;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const kind = kinds[next % kinds.length];
        next += 1;
        commands.simulateNotification(kind).catch((err) => console.error("simulateNotification failed:", err));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
      <>
        <main>
          <TopBar>
            <span className="step-counter">STEP 1 / 2</span>
          </TopBar>
          <ConnectStep authStatus={authStatus} />
        </main>
        <ToastStack toasts={toasts} onDismiss={dismissToast} onOpen={openToast} />
      </>
    );
  }

  if (authStatus.status === "connected" && watchlistCount === 0 && !skippedFirstStreamer) {
    return (
      <>
        <main>
          <TopBar>
            <span className="step-counter">STEP 2 / 2</span>
          </TopBar>
          <AddFirstStreamerStep
            onDone={() => {
              setSkippedFirstStreamer(true);
              setRefreshSignal((k) => k + 1);
            }}
          />
        </main>
        <ToastStack toasts={toasts} onDismiss={dismissToast} onOpen={openToast} />
      </>
    );
  }

  return (
    <>
      <main>
        <TopBar>
          <ViewNav view={view} onChange={setView} />
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
      <ToastStack toasts={toasts} onDismiss={dismissToast} onOpen={openToast} />
    </>
  );
}

export default App;
