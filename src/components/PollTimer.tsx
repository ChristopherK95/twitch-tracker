import { useEffect, useState } from "react";
import { onLiveStateUpdated } from "../lib/tauri";
import "./PollTimer.css";

// Matches the scheduler's BASE_INTERVAL (src-tauri/src/scheduler.rs). During backoff
// (rare — only on repeated Twitch API failures) the real next poll can take longer than
// this; the ring just sits empty until the next real "live-state-updated" event resets it,
// which is an acceptable simplification for a purely cosmetic indicator.
const BASE_INTERVAL_SECONDS = 20;

const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PollTimer() {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const unlisten = onLiveStateUpdated(() => setCycle((c) => c + 1));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="poll-timer" title="Time until the next check">
      <svg className="poll-timer-ring" viewBox="0 0 20 20" width="20" height="20">
        <circle className="ring-track" cx="10" cy="10" r={RADIUS} />
        <circle
          key={cycle}
          className="ring-progress"
          cx="10"
          cy="10"
          r={RADIUS}
          style={
            {
              strokeDasharray: CIRCUMFERENCE,
              "--circumference": CIRCUMFERENCE,
              animationDuration: `${BASE_INTERVAL_SECONDS}s`,
            } as React.CSSProperties
          }
        />
      </svg>
      <div key={`icon-${cycle}`} className="poll-timer-icon">
        <HourglassIcon />
      </div>
    </div>
  );
}

function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
      <path
        d="M6 3h12M6 21h12M7 3c0 5 5 7 5 9s-5 4-5 9M17 3c0 5-5 7-5 9s5 4 5 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
