# Prototype the Settings page and app lifecycle UX

Type: prototype
Status: resolved
Blocked by: 01

## Question

Using the Tauri capability facts from the tray/notifications/autostart/single-instance research ticket, prototype:

- The Settings page: the "Connect your Twitch account" Device Code Grant flow (what the user sees during the code/approval step, and connected/disconnected states — note the [polling scheduler](03-polling-scheduler.md) can flip a connected account to "disconnected" on its own if token refresh ever fails, so this isn't only an initial-setup state; [error-handling](04-error-handling.md) already settled that this shows as a tray badge + one desktop notification + an in-app banner — this ticket designs what those actually look like), per-event-type notification toggles (Go-Live / Go-Offline / Metadata Change), and the "start on login" toggle.
- Tray behavior: tray icon states (if any beyond a static icon), the tray menu contents (at least "Show TwitchTrack" and "Quit"), and what happens the first time the user closes the window (does it need a one-time explainer that the app keeps running in the tray, given that's a nice-to-have to avoid confusing a user who expects the app to quit?).

**Reopened decision** (research ticket 01 overturned the map's original assumption): clicking a desktop notification can't focus the app or carry "which streamer" data — Tauri's notification plugin has no click callback on desktop. Decide the actual behavior instead: does a new Notification just rely on the tray icon click (generic "show the app," landing on whatever the main view already shows), or is there some other way to route to the specific Watched Streamer (e.g. the main view auto-highlights/scrolls to whoever most recently changed status)?

## Answer

**Notification routing (the reopened decision)**: resolved before prototyping — the main Watchlist view auto-highlights/scrolls to whichever streamer most recently caused a Notification when the window is opened/focused (via the tray icon click). No click-through data from the notification itself is needed.

**Settings/lifecycle layout**: prototyped three structural variants as a live-switchable artifact: [Settings & Lifecycle prototype](https://claude.ai/code/artifact/734a6bc6-c5b6-4fa8-9e5b-7fc1151d17e6) (primary source — no repo/branch yet to fold this into).

**Chosen: "Card Dashboard"** — independent cards in a grid (Account spans full width; Notifications and Startup+Tray each get their own card), glanceable rather than a linear scroll or tabbed navigation.

Content settled (same across all three variants, so this travels with the chosen layout):
- **Account card**: four states — not connected (a "Connect your Twitch account" button), connecting (shows the device code, e.g. "WXYZ-7890", and the twitch.tv/activate instruction), connected ("Connected as &lt;username&gt;" + Disconnect), and disconnected/error (a warning-styled banner + Reconnect button — this is the state ticket 04's failed-refresh case flips into, not just a first-run state).
- **Notifications card**: three toggles using CONTEXT.md's exact terms — Go-Live, Go-Offline, Metadata Change.
- **Startup + Tray card**: a "start on login" toggle, plus a static tray icon/menu illustration (icon gets a warning badge whenever the account is disconnected; clicking shows "Show TwitchTrack" / "Quit") and a "preview first-close message" control that demonstrates the one-time toast explaining the app keeps running in the tray.

