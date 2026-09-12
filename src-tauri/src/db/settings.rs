use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Clone, Copy)]
pub struct NotificationToggles {
    pub go_live: bool,
    pub go_offline: bool,
    pub metadata_change: bool,
}

pub fn notification_toggles(conn: &Connection) -> rusqlite::Result<NotificationToggles> {
    conn.query_row(
        "SELECT notify_go_live, notify_go_offline, notify_metadata_change FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(NotificationToggles {
                go_live: row.get::<_, i64>(0)? != 0,
                go_offline: row.get::<_, i64>(1)? != 0,
                metadata_change: row.get::<_, i64>(2)? != 0,
            })
        },
    )
}

/// Full Settings row for the "Card Dashboard" Settings view. The OAuth token itself never
/// lives here (OS keychain, per the map's standing decision) — twitch_user_id/twitch_login
/// are just cached display fields, kept in sync with AuthState elsewhere.
#[derive(Debug, Clone, Serialize)]
pub struct SettingsRow {
    pub notify_go_live: bool,
    pub notify_go_offline: bool,
    pub notify_metadata_change: bool,
    pub start_on_login: bool,
    pub twitch_login: Option<String>,
    pub twitch_profile_image_url: Option<String>,
}

pub fn get(conn: &Connection) -> rusqlite::Result<SettingsRow> {
    conn.query_row(
        "SELECT notify_go_live, notify_go_offline, notify_metadata_change, start_on_login, twitch_login, twitch_profile_image_url
         FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(SettingsRow {
                notify_go_live: row.get::<_, i64>(0)? != 0,
                notify_go_offline: row.get::<_, i64>(1)? != 0,
                notify_metadata_change: row.get::<_, i64>(2)? != 0,
                start_on_login: row.get::<_, i64>(3)? != 0,
                twitch_login: row.get(4)?,
                twitch_profile_image_url: row.get(5)?,
            })
        },
    )
}

/// Sets both cached display fields for the connected account in one write — called
/// wherever a connect (or startup re-validation) succeeds.
pub fn set_twitch_identity(
    conn: &Connection,
    twitch_user_id: &str,
    twitch_login: &str,
    profile_image_url: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE settings SET twitch_user_id = ?1, twitch_login = ?2, twitch_profile_image_url = ?3 WHERE id = 1",
        rusqlite::params![twitch_user_id, twitch_login, profile_image_url],
    )?;
    Ok(())
}

pub enum NotificationKind {
    GoLive,
    GoOffline,
    MetadataChange,
}

pub fn set_notification_toggle(conn: &Connection, kind: NotificationKind, enabled: bool) -> rusqlite::Result<()> {
    let column = match kind {
        NotificationKind::GoLive => "notify_go_live",
        NotificationKind::GoOffline => "notify_go_offline",
        NotificationKind::MetadataChange => "notify_metadata_change",
    };
    conn.execute(
        &format!("UPDATE settings SET {column} = ?1 WHERE id = 1"),
        [enabled as i64],
    )?;
    Ok(())
}

pub fn set_start_on_login(conn: &Connection, enabled: bool) -> rusqlite::Result<()> {
    conn.execute("UPDATE settings SET start_on_login = ?1 WHERE id = 1", [enabled as i64])?;
    Ok(())
}

pub fn has_shown_tray_explainer(conn: &Connection) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT has_shown_tray_explainer FROM settings WHERE id = 1",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|v| v != 0)
}

pub fn mark_tray_explainer_shown(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("UPDATE settings SET has_shown_tray_explainer = 1 WHERE id = 1", [])?;
    Ok(())
}
