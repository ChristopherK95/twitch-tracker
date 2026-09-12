-- Cached display field for Settings' Account card, alongside twitch_login (never the
-- token itself — that stays in the OS keychain per the map's standing decision).
ALTER TABLE settings ADD COLUMN twitch_profile_image_url TEXT;
