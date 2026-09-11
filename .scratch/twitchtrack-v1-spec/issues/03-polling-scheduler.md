# Design the polling scheduler

Type: grilling
Status: resolved
Blocked by: (none)

## Question

The map's standing decision fixes the approach as Helix polling (not EventSub), with Twitch's rate limit at 800 points/minute (app token) and `Get Streams` batching up to 100 user IDs per call — comfortably covering a 10-30 streamer Watchlist at a 15-30s interval.

Decide the concrete scheduler design:

- Exact poll interval (or an adaptive interval?) for checking Watchlist status via `Get Streams` / `Get Channel Information`.
- How a Status Change (Go-Live/Go-Offline) and a Metadata Change (title/category, gated by the map's 2-minute debounce) are detected from successive polls, and how the debounce timer is implemented (e.g. does a change need to be seen stable across N consecutive polls, or is it wall-clock-timer-based independent of poll cadence?).
- Backoff/retry behavior when a poll fails (Twitch API error, network outage, rate-limit response).
- How the scheduler interacts with the OAuth user access token: detecting expiry, refreshing it, and what happens to polling while a refresh or re-auth is needed.
- Whether polling pauses/resumes around app tray-hide/show, sleep/wake, or runs unconditionally while the app process is alive.

## Answer

**Interval & batching**: fixed 20-second tick. Every tick, one batched `Get Streams` call covers the entire Watchlist (up to 100 IDs per call — the 10-30 streamer list always fits in one), trivially within the 800-points/minute bucket (1 point per call, 3 calls/minute).

**Change detection**: the scheduler owns the in-memory live-state cache (per the SQLite schema decision — nothing here is persisted). Each tick compares the fresh poll result per streamer against the in-memory "last confirmed" snapshot:
- **Status Change** (Go-Live/Go-Offline): fires immediately as a Notification the first tick it differs from the last confirmed snapshot. No debounce — a status flip is trusted on sight.
- **Metadata Change** (title/category): a differing value starts or updates a "pending candidate" (value + timestamp) distinct from the last-confirmed value. Any tick where the poll doesn't match the current candidate resets it (new candidate, new timestamp). Once a candidate has matched every tick for 2 minutes straight, it's promoted to a confirmed Notification (written to the `notifications` table) and becomes the new last-confirmed value.

**Token lifecycle**: the OAuth user access token (~4hr lifetime) refreshes **proactively** — the scheduler tracks the token's expiry timestamp (from `expires_in` at grant/refresh time) and refreshes once under ~30 minutes remain, before it ever hits a live poll. TwitchTrack registers as a Device Code Grant **public client**, so refreshing needs no client_secret (per Twitch's refresh-token docs). Refresh tokens rotate on every use and must be re-persisted to the OS keychain each time. **Reactive fallback**: if a poll still comes back 401 unexpectedly, the scheduler refreshes immediately and retries that tick rather than waiting for proactive refresh. If the refresh itself fails (refresh token expired — documented as 30 days of inactivity, practically unreachable given 4hr proactive refreshes, but possible if the app hasn't run in a month), polling pauses and auth state flips to "disconnected" — surfaced via Settings (ticket 06) and the error-handling ticket (04), requiring the user to redo the "Connect your Twitch account" flow.

**Backoff on failure**: exponential backoff on transient failures (network error, 5xx, rate-limit response) — 20s → 40s → 80s → ... capped at 5 minutes, resetting to the normal 20s cadence as soon as a poll succeeds.

**Lifecycle**: polling runs on a plain repeating timer for as long as the app process is alive, tray-hidden or visible — no special OS sleep/wake handling for v1 (worst case ~20s of staleness after wake, resolved by the next tick).

