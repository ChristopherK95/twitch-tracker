# Decide error-handling behavior for Twitch API and auth failures

Type: grilling
Status: resolved
Blocked by: (none)

## Question

Decide the user-visible behavior (and where it surfaces — in-app banner, Notification Log entry, tray icon state, etc.) for each of these cases:

- The stored OAuth user access token is expired, revoked, or otherwise invalid (Twitch API returns 401).
- Twitch's API is unreachable or returns 5xx errors during a poll.
- The polling scheduler hits Twitch's rate limit despite the design in the polling-scheduler ticket.
- A `Search Channels` query (adding to the Watchlist) returns no results, or the search itself fails.
- A Watched Streamer's channel is deleted/banned/suspended on Twitch.

For each, decide: does the user need to take action (e.g. re-connect their Twitch account), and how is that surfaced without being disruptive for a background, tray-resident app?

**Settled by [polling scheduler](03-polling-scheduler.md) — design against this, don't reopen it:** token refresh is proactive and silent (no user-visible action) in the normal case; exponential backoff (20s→...→5min cap) already handles transient network/5xx/rate-limit failures without user involvement. The only case that reaches the user is a **failed refresh** (refresh token itself expired/invalid), which flips auth state to "disconnected" and pauses polling — this ticket should decide how "disconnected" is surfaced (banner? tray icon change? both?) and the Watched-Streamer-deleted/banned and search-failure cases, which ticket 03 didn't cover.

## Answer

**Disconnected auth state** (token refresh failed): surfaced three ways at once — (1) a persistent low-key tray icon badge/variant for as long as the state lasts, (2) exactly one desktop notification at the moment it happens ("TwitchTrack disconnected from Twitch — reconnect in Settings"), not repeated, and (3) a banner in the main view/Settings once the window is opened. Dismissed by successfully redoing the "Connect your Twitch account" flow.

**Search failure**: no results is a normal empty state ("No channels found for '...'"). A request failure (network/API error) shows an inline error ("Couldn't search right now — try again") with no auto-retry — it's a foreground interaction, the user is already there to just retry manually.

**Watched Streamer deleted/banned/suspended**: **researched and confirmed not distinguishable** — Twitch's Helix API (`Get Users`, `Get Streams`, `Get Channel Information`) returns an identical empty-array 200 response for a banned, suspended, deleted, or otherwise nonexistent user_id; there is no documented endpoint or field that reveals *why* a channel stopped resolving (confirmed via Twitch dev forum staff/moderator responses — this is deliberate, not a gap). Per the user's own fallback once this was known to be impossible: **no special detection or labeling for v1** — such a streamer just continues to display as offline, indistinguishable from any other offline Watched Streamer.

