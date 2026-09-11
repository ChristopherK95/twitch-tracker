# Design the SQLite schema for Watchlist, Settings, and Notification Log

Type: grilling
Status: resolved
Blocked by: (none)

## Question

Design the local SQLite schema backing the three persisted domain concepts:

- **Watchlist**: the set of Watched Streamers (which Twitch channel, some notion of display order given the "live-status-first" ordering rule is a runtime sort rather than necessarily a stored order — decide whether manual ordering needs a stored position at all given it's a nice-to-have for v1).
- **Settings**: notification toggles per event-type (Go-Live / Go-Offline / Metadata Change), start-on-login, the stored OAuth token reference (actual token lives in the OS keychain per the map's standing decision — decide what, if anything, SQLite needs to reference it).
- **Notification Log**: one row per Notification (which Watched Streamer, which event type — Status Change or Metadata Change — and enough detail to render it, e.g. old/new title or category for a Metadata Change), plus whatever the 30-day retention prune job needs to query on efficiently.

Resolve table/column shapes, key relationships, and indexes needed for the retention prune and for the Notification Log page's display/filtering. Use the vocabulary from CONTEXT.md.

## Answer

**Key architectural decision**: SQLite holds only durable/identity data. Current live status, view count, title, category, and Stream Session start time are **not persisted** — they're re-derived every poll (15-30s) into an in-memory cache the polling scheduler owns and the UI reads. Persisting data that's re-fetched that often just adds write load and a staleness risk for no benefit; on restart the app waits one poll cycle to repopulate.

Also decided: a Watched Streamer's name is clickable and opens the stream in the OS default browser, incrementing `click_count`. Live streamers are ranked `click_count DESC, view_count DESC` (view_count from the in-memory cache, not stored); offline streamers are ranked below all live ones, by `last_live_at DESC` (nulls — never live yet — last). `click_count` accumulates all-time, no decay, for v1.

```sql
CREATE TABLE watched_streamers (
  user_id            INTEGER PRIMARY KEY,   -- Twitch's numeric broadcaster/user id; stable even if login/display_name changes
  login              TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  profile_image_url  TEXT,
  added_at           INTEGER NOT NULL,       -- unix epoch seconds
  last_live_at       INTEGER,                -- unix epoch seconds, nullable; set at each Go-Offline
  click_count        INTEGER NOT NULL DEFAULT 0
);
-- No stored position/order column: v1 has no manual reorder feature to back.

CREATE TABLE settings (
  id                       INTEGER PRIMARY KEY CHECK (id = 1), -- single-row table
  notify_go_live           INTEGER NOT NULL DEFAULT 1,
  notify_go_offline        INTEGER NOT NULL DEFAULT 1,
  notify_metadata_change   INTEGER NOT NULL DEFAULT 1,
  start_on_login           INTEGER NOT NULL DEFAULT 0,
  twitch_user_id           TEXT,             -- nullable; set once "Connect your Twitch account" completes
  twitch_login             TEXT              -- cached, for showing "Connected as <login>"
  -- The OAuth token itself lives in the OS keychain, never here.
);

CREATE TABLE notifications (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type            TEXT NOT NULL CHECK (event_type IN ('go_live', 'go_offline', 'metadata_change')),
  streamer_user_id      INTEGER NOT NULL,    -- denormalized snapshot, not a live FK (see below)
  streamer_login        TEXT NOT NULL,       -- denormalized snapshot
  streamer_display_name TEXT NOT NULL,       -- denormalized snapshot
  created_at            INTEGER NOT NULL,    -- unix epoch seconds
  category              TEXT,                -- go_live only: category/game at the moment they went live
  title                 TEXT,                -- go_live only: title at the moment they went live
  duration_seconds      INTEGER,             -- go_offline only: the just-ended Stream Session's length
  old_title             TEXT,                -- metadata_change only
  new_title              TEXT,               -- metadata_change only
  old_category           TEXT,               -- metadata_change only
  new_category           TEXT                -- metadata_change only
);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
-- Serves both the 30-day prune job (DELETE WHERE created_at < cutoff) and the
-- Notification Log page's display order (ORDER BY created_at DESC).
```

Removing a Watched Streamer hard-deletes its row; `notifications` keeps its own denormalized `streamer_login`/`streamer_display_name`, so the Notification Log stays intact and readable regardless of whether the streamer is still tracked.

Metadata Change debounce (~2 min stability) is purely in-memory scheduler state — no staging table. A restart mid-debounce just resets the timer; low-stakes given the short window.

**Amended while resolving [Notification Log prototype](07-notification-log-prototype.md)**: added `category`/`title` (go_live snapshot) and `duration_seconds` (go_offline) to `notifications`, so a Go-Live/Go-Offline Notification carries real context instead of just a bare name + timestamp. `category`/`title` are populated by the scheduler from its in-memory cache at the instant Go-Live fires; `duration_seconds` is computed from the Stream Session's in-memory start time at the instant Go-Offline fires.

