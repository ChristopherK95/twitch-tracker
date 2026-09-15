-- One-time data fix: before this app version, a metadata_change that touched both title
-- and category in the same debounce window was logged as a single combined row. The
-- scheduler now logs those as two separate rows so the Notification Log reads more
-- clearly; this backfills that shape onto any rows already written under the old
-- behavior. Desktop notifications were never affected — they're built from the live
-- poll data, not this table.
INSERT INTO notifications (event_type, streamer_user_id, streamer_login, streamer_display_name, created_at, old_title, new_title)
SELECT event_type, streamer_user_id, streamer_login, streamer_display_name, created_at, old_title, new_title
FROM notifications
WHERE event_type = 'metadata_change' AND old_title IS NOT NULL AND old_category IS NOT NULL;

UPDATE notifications
SET old_title = NULL, new_title = NULL
WHERE event_type = 'metadata_change' AND old_title IS NOT NULL AND old_category IS NOT NULL;
