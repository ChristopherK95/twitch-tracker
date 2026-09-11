# TwitchTrack

A Tauri desktop app that watches a user's chosen Twitch streamers and notifies them of live status and stream metadata changes.

## Language

**Watched Streamer**:
A Twitch channel the user has added to their Watchlist to be monitored.
_Avoid_: Tracked streamer, followed streamer (Twitch's own "Follow" is a separate, unrelated relationship — a user may watch a streamer without following them on Twitch, or follow without watching).

**Watchlist**:
The user's ordered set of Watched Streamers. Local to one install; never shared between installs.
_Avoid_: Tracked list, favorites.

**Status Change**:
A transition between a Watched Streamer being live and offline. The two directions are **Go-Live** and **Go-Offline**.
_Avoid_: Live event, stream event (too broad — conflates with Metadata Change).

**Metadata Change**:
An edit to a Watched Streamer's title or category while they are live. Distinct from a Status Change: the streamer stays live throughout.
_Avoid_: Title change, update event.

**Stream Session**:
The continuous span a Watched Streamer is live, starting at a Go-Live and ending at the matching Go-Offline. Its start time and elapsed duration are derived from this span.
_Avoid_: Broadcast, stream (ambiguous between the session and the streamer's channel).

**Notification**:
A record the app generates in response to a Status Change or Metadata Change, surfaced in-app and optionally as a desktop notification.
_Avoid_: Alert, event (an event is what triggers a Notification, not the Notification itself).

**Notification Log**:
The page listing every Notification generated during the app's runtime, in chronological order.
_Avoid_: Notification history, activity feed.
