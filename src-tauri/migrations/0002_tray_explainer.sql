-- Tracks whether the one-time "TwitchTrack is still running in the tray" explainer
-- has already been shown (see .scratch/twitchtrack-v1-spec/issues/06-settings-lifecycle-prototype.md).
ALTER TABLE settings ADD COLUMN has_shown_tray_explainer INTEGER NOT NULL DEFAULT 0;
