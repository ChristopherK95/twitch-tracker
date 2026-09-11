# TwitchTrack v1 Spec

Label: wayfinder:map

## Destination

A build-ready v1 spec for TwitchTrack: a from-scratch Tauri desktop app, built and run as independent single-user installs (no shared backend, no multi-profile support) for two specific users. The spec covers Watchlist management, a Notification system (Status Change + Metadata Change), a live-streamer info display, a Settings page, a Notification Log, and a closed set of v1 extensions (stream preview thumbnails). The map is done when every open decision needed to hand this spec to implementation has been resolved — nothing left to design, only to build.

## Notes

- Domain vocabulary is fixed in [CONTEXT.md](../../CONTEXT.md) at the repo root (Watched Streamer, Watchlist, Status Change, Metadata Change, Stream Session, Notification, Notification Log). Use these terms in every ticket; update CONTEXT.md via `domain-modeling` if a new term needs coining.
- Call `grilling` for any ticket needing back-and-forth product/technical judgment; call `prototype` for any "how should it look/behave" UI question; call `research` for any fact-finding against Twitch/Tauri docs.

**Standing decisions for this effort** (settled during charting; every session should treat these as fixed, not re-litigate them):

- **Stack**: Tauri + React + TypeScript frontend; SQLite (via Tauri SQL plugin) for local persistence.
- **Auth**: OAuth Device Code Grant, registered as a **public client** (no client_secret ever, including for token refresh). One Client ID is registered once by the developer and bundled into the app itself — end users never touch the Twitch Developer Console. Settings shows a "Connect your Twitch account" button (device code + browser approval). User access token lasts ~4hrs; the scheduler refreshes proactively (per [polling scheduler](issues/03-polling-scheduler.md)) using the rotating refresh token (30-day inactivity expiry). If refresh itself ever fails, the user redoes the connect flow.
- **Live/offline & metadata detection**: Helix polling (not EventSub WebSocket) for v1 — a 30-60s detection delay is acceptable. Twitch's Helix rate limit is 800 points/minute (app token) and `Get Streams` batches up to 100 user IDs per call, comfortably covering a 10-30 streamer Watchlist at a 15-30s poll interval.
- **Credential/token storage**: OS-native secure storage (Keychain/Credential Manager/Secret Service) via a Tauri keyring plugin. Never plaintext on disk.
- **Watchlist UX**: search-as-you-type against Twitch's `Search Channels`; list ordered live-status-first (live streamers above offline). Live streamers rank by `click_count DESC, view_count DESC`; offline streamers rank below all live ones by `last_live_at DESC` (never-live last). A streamer's name is clickable and opens their stream in the OS default browser, incrementing `click_count`. Manual drag-reordering is a nice-to-have, not required for v1.
- **Persistence model**: SQLite holds only durable/identity data (Watched Streamer identity, `click_count`, `last_live_at`, Settings, Notification Log). Live status/view count/title/category/session timing is never persisted — it's re-derived every poll into an in-memory cache, per [SQLite schema](issues/02-sqlite-schema.md).
- **Metadata Change debounce**: only fire a Notification once a new title/category has held stable for ~2 minutes, to avoid spam from streamers editing their title live.
- **Notification behavior**: toggles in Settings are global per event-type (Go-Live / Go-Offline / Metadata Change) for v1 — per-Watched-Streamer muting is explicitly out of scope (see below). Desktop notifications can't carry click data on Tauri desktop (confirmed by [Tauri capabilities research](issues/01-tauri-capabilities-research.md)) — instead, the tray icon click shows/focuses the app, and the main Watchlist view auto-highlights/scrolls to whichever streamer most recently caused a Notification (settled in [Settings/lifecycle prototype](issues/06-settings-lifecycle-prototype.md)).
- **Notification Log retention**: capped at 30 days with a background prune job.
- **Stream preview**: a static thumbnail image (Twitch's `thumbnail_url` CDN snapshot), not an embedded live player.
- **App lifecycle**: tray-resident. Closing/minimizing the window hides to a system tray icon; polling keeps running in the background. Tray menu has a real "Quit". Settings has a "start on login" toggle.
- **Packaging for v1**: hand-built local binaries, no installer polish, no auto-updater, no code signing.
- **Visual identity**: "Stream Violet" — dark bg `#15121C`, surfaces `#1E1A2B`/`#272238`, text `#F2EEFA`/`#9A90BB`, accent `#8B5CF6`, semantic live-indicator `#34D399`. Sora (display), IBM Plex Sans (body), IBM Plex Mono (tabular data). See [visual identity](issues/09-visual-identity-prototype.md).

## Decisions so far

- [Tauri capabilities research](issues/01-tauri-capabilities-research.md): tray icon (menu + click events), autostart, and single-instance all have official plugins with straightforward APIs. But desktop notification click-handling does **not** exist in Tauri's notification plugin (mobile-only) — this overturned the map's original "click notification to focus/jump to streamer" decision, now reopened for ticket 06.
- [SQLite schema](issues/02-sqlite-schema.md): `watched_streamers` (identity + `click_count` + `last_live_at`, no stored order), single-row `settings`, and `notifications` (denormalized streamer info, indexed on `created_at`; amended to also carry a go_live category/title snapshot and a go_offline `duration_seconds`). Live state (status/viewers/title/category) is deliberately never persisted — in-memory only, re-derived each poll.
- [Polling scheduler](issues/03-polling-scheduler.md): fixed 20s tick, one batched `Get Streams` call for the whole Watchlist. Status Change fires immediately on the first differing poll; Metadata Change requires a pending-candidate value to match 2 minutes straight. Token refreshes proactively (<30 min remaining); exponential backoff (20s→...→5min cap) on transient failures; a failed refresh flips auth state to "disconnected."
- [Error-handling behavior](issues/04-error-handling.md): "disconnected" auth surfaces via tray badge + one desktop notification + banner on open. Search failures show an inline error, no auto-retry. A banned/suspended/deleted Watched Streamer is **not** distinguishable from any other reason a channel stops resolving (confirmed via Twitch's API and dev forums) — no special handling for v1, it just reads as offline.
- [Watchlist display prototype](issues/05-watchlist-display-prototype.md): "Signal Feed" chosen — single dense list, live section (always-visible thumbnail per row) above an offline section (compact rows, no thumbnail). Search-to-add is inline at the top of the same view, not a separate flow. See the [prototype artifact](https://claude.ai/code/artifact/5331021d-b487-4ec2-b0f1-9b7e883f3973).
- [Settings/lifecycle prototype](issues/06-settings-lifecycle-prototype.md): "Card Dashboard" chosen — Account (4 states incl. disconnected/reconnect), Notifications (Go-Live/Go-Offline/Metadata Change toggles), and Startup+Tray as independent cards. Tray icon gets a warning badge when disconnected; a one-time toast explains the tray-resident behavior on first close. See the [prototype artifact](https://claude.ai/code/artifact/734a6bc6-c5b6-4fa8-9e5b-7fc1151d17e6).
- [Notification Log prototype](issues/07-notification-log-prototype.md): "Grouped by Streamer" chosen — collapsible per-streamer sections, sorted by notification count, with filter chips and a footer note about the 30-day retention prune. Final notification copy for all three event types settled (see ticket). Also amended the SQLite schema to add a go_live category/title snapshot and a go_offline duration. See the [prototype artifact](https://claude.ai/code/artifact/eea041f3-77ee-4587-9271-ddf52b13702c).
- [First-run onboarding flow](issues/08-onboarding-prototype.md): launch goes straight to Connect (no empty Watchlist first); after connecting, a dedicated "add your first streamer" screen blocks progress (with a "Skip for now" escape hatch) before landing on the real Watchlist; Settings is never toured during onboarding.
- [Visual identity](issues/09-visual-identity-prototype.md): "Stream Violet" chosen — validates the placeholder palette used throughout charting as the real answer. See the [prototype artifact](https://claude.ai/code/artifact/17027c27-b065-496c-91e0-74913289e91f).

## Not yet specified

_(none — visual design graduated to a ticket; testing strategy ruled out of scope)_

## Out of scope

- **Per-Watched-Streamer notification muting**: v1 toggles are global per event-type only; muting individual streamers is a v2 idea, not designed now.
- **EventSub WebSocket (real-time push)**: v1 uses polling; push-based detection is a possible future optimization, not part of this spec.
- **Multi-profile / shared-install support**: each install is single-user and independent; no accounts, no shared Watchlist.
- **Auto-updater, installer polish, code signing, public distribution**: v1 ships as hand-built local binaries for two known users only.
- **Testing strategy** (unit/integration/e2e): an implementation-time call, not a product/design decision this spec needs to settle.
