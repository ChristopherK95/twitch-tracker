-- TwitchTrack initial schema.
-- Source of record: .scratch/twitchtrack-v1-spec/issues/02-sqlite-schema.md
-- (amended per .scratch/twitchtrack-v1-spec/issues/07-notification-log-prototype.md)

CREATE TABLE watched_streamers (
  user_id            INTEGER PRIMARY KEY, -- Twitch's numeric broadcaster/user id; stable even if login/display_name changes
  login              TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  profile_image_url  TEXT,
  added_at           INTEGER NOT NULL,     -- unix epoch seconds
  last_live_at       INTEGER,              -- unix epoch seconds, nullable; set at each Go-Offline
  click_count        INTEGER NOT NULL DEFAULT 0
);
-- No stored position/order column: v1 has no manual reorder feature to back.
-- Runtime ordering (not stored): live streamers by click_count DESC, view_count DESC;
-- offline streamers below all live ones by last_live_at DESC (nulls last).

CREATE TABLE settings (
  id                       INTEGER PRIMARY KEY CHECK (id = 1), -- single-row table
  notify_go_live           INTEGER NOT NULL DEFAULT 1,
  notify_go_offline        INTEGER NOT NULL DEFAULT 1,
  notify_metadata_change   INTEGER NOT NULL DEFAULT 1,
  start_on_login           INTEGER NOT NULL DEFAULT 0,
  twitch_user_id           TEXT,           -- nullable; set once "Connect your Twitch account" completes
  twitch_login             TEXT            -- cached, for showing "Connected as <login>"
  -- The OAuth token itself lives in the OS keychain (via the `keyring` crate), never here.
);
INSERT INTO settings (id) VALUES (1);

CREATE TABLE notifications (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type            TEXT NOT NULL CHECK (event_type IN ('go_live', 'go_offline', 'metadata_change')),
  streamer_user_id      INTEGER NOT NULL,  -- denormalized snapshot, not a live FK
  streamer_login        TEXT NOT NULL,     -- denormalized snapshot
  streamer_display_name TEXT NOT NULL,     -- denormalized snapshot
  created_at            INTEGER NOT NULL,  -- unix epoch seconds
  category              TEXT,              -- go_live only: category/game at the moment they went live
  title                 TEXT,              -- go_live only: title at the moment they went live
  duration_seconds      INTEGER,           -- go_offline only: the just-ended Stream Session's length
  old_title             TEXT,              -- metadata_change only
  new_title             TEXT,              -- metadata_change only
  old_category          TEXT,              -- metadata_change only
  new_category          TEXT               -- metadata_change only
);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
-- Serves both the 30-day retention prune job (DELETE WHERE created_at < cutoff) and
-- the Notification Log page's display order (ORDER BY created_at DESC).
