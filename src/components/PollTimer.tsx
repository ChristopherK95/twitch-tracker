import { useEffect, useState } from "react";
import { onLiveStateUpdated } from "../lib/tauri";
import { HourglassIcon } from "./icons";
import "./PollTimer.css";

// Matches the scheduler's BASE_INTERVAL (src-tauri/src/scheduler.rs). During backoff
// (rare — only on repeated Twitch API failures) the real next poll can take longer than
// this; the ring just sits empty until the next real "live-state-updated" event resets it,
// which is an acceptable simplification for a purely cosmetic indicator.
const BASE_INTERVAL_SECONDS = 20;

const RADIUS = 11;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PollTimer() {
  const [cycle, setCycle] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(BASE_INTERVAL_SECONDS);

  useEffect(() => {
    const unlisten = onLiveStateUpdated(() => {
      setCycle((c) => c + 1);
      setSecondsLeft(BASE_INTERVAL_SECONDS);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="poll-timer" title="Time until the next check">
      <span className="poll-timer-label">NEXT {secondsLeft}s</span>
      <div className="poll-timer-ring-wrap">
        <svg className="poll-timer-ring" viewBox="0 0 30 30" width="30" height="30">
          <circle className="ring-track" cx="15" cy="15" r={RADIUS} />
          <circle
            key={cycle}
            className="ring-progress"
            cx="15"
            cy="15"
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
          <HourglassIcon size={14} />
        </div>
      </div>
    </div>
  );
}
