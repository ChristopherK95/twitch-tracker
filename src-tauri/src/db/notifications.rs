use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct NotificationRow {
    pub id: i64,
    pub event_type: String, // "go_live" | "go_offline" | "metadata_change"
    pub streamer_user_id: i64,
    pub streamer_login: String,
    pub streamer_display_name: String,
    pub created_at: i64,
    pub category: Option<String>,
    pub title: Option<String>,
    pub duration_seconds: Option<i64>,
    pub old_title: Option<String>,
    pub new_title: Option<String>,
    pub old_category: Option<String>,
    pub new_category: Option<String>,
    pub streamer_profile_image_url: Option<String>,
}

pub struct NewGoLive<'a> {
    pub user_id: i64,
    pub login: &'a str,
    pub display_name: &'a str,
    pub category: &'a str,
    pub title: &'a str,
}

pub struct NewGoOffline<'a> {
    pub user_id: i64,
    pub login: &'a str,
    pub display_name: &'a str,
    pub duration_seconds: i64,
}

pub struct NewMetadataChange<'a> {
    pub user_id: i64,
    pub login: &'a str,
    pub display_name: &'a str,
    pub old_title: Option<&'a str>,
    pub new_title: Option<&'a str>,
    pub old_category: Option<&'a str>,
    pub new_category: Option<&'a str>,
}

pub fn insert_go_live(conn: &Connection, n: &NewGoLive, now: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO notifications (event_type, streamer_user_id, streamer_login, streamer_display_name, created_at, category, title)
         VALUES ('go_live', ?1, ?2, ?3, ?4, ?5, ?6)",
        params![n.user_id, n.login, n.display_name, now, n.category, n.title],
    )?;
    Ok(())
}

pub fn insert_go_offline(conn: &Connection, n: &NewGoOffline, now: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO notifications (event_type, streamer_user_id, streamer_login, streamer_display_name, created_at, duration_seconds)
         VALUES ('go_offline', ?1, ?2, ?3, ?4, ?5)",
        params![n.user_id, n.login, n.display_name, now, n.duration_seconds],
    )?;
    Ok(())
}

pub fn insert_metadata_change(conn: &Connection, n: &NewMetadataChange, now: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO notifications (event_type, streamer_user_id, streamer_login, streamer_display_name, created_at, old_title, new_title, old_category, new_category)
         VALUES ('metadata_change', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            n.user_id,
            n.login,
            n.display_name,
            now,
            n.old_title,
            n.new_title,
            n.old_category,
            n.new_category
        ],
    )?;
    Ok(())
}

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<NotificationRow>> {
    // LEFT JOIN so a notification still lists (with no picture) if its streamer was since
    // removed from the Watchlist.
    let mut stmt = conn.prepare(
        "SELECT n.id, n.event_type, n.streamer_user_id, n.streamer_login, n.streamer_display_name, n.created_at,
                n.category, n.title, n.duration_seconds, n.old_title, n.new_title, n.old_category, n.new_category,
                w.profile_image_url
         FROM notifications n
         LEFT JOIN watched_streamers w ON w.user_id = n.streamer_user_id
         ORDER BY n.created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(NotificationRow {
            id: row.get(0)?,
            event_type: row.get(1)?,
            streamer_user_id: row.get(2)?,
            streamer_login: row.get(3)?,
            streamer_display_name: row.get(4)?,
            created_at: row.get(5)?,
            category: row.get(6)?,
            title: row.get(7)?,
            duration_seconds: row.get(8)?,
            old_title: row.get(9)?,
            new_title: row.get(10)?,
            old_category: row.get(11)?,
            new_category: row.get(12)?,
            streamer_profile_image_url: row.get(13)?,
        })
    })?;
    rows.collect()
}

/// 30-day retention per the settled schema decision.
pub fn prune_older_than_30_days(conn: &Connection, now: i64) -> rusqlite::Result<usize> {
    let cutoff = now - 30 * 86_400;
    conn.execute("DELETE FROM notifications WHERE created_at < ?1", params![cutoff])
}

/// Manual "clear log" action — a user-initiated wipe of the whole Notification Log,
/// distinct from the automatic 30-day retention prune.
pub fn clear_all(conn: &Connection) -> rusqlite::Result<usize> {
    conn.execute("DELETE FROM notifications", [])
}

pub struct LatestStatus {
    pub user_id: i64,
    pub is_live: bool, // true if the latest go_live/go_offline for this streamer was a go_live
    pub created_at: i64,
    pub category: Option<String>,
    pub title: Option<String>,
}

/// The most recent Status Change (go_live or go_offline) per streamer — the Notification
/// Log's persistence is how the scheduler avoids re-announcing a Go-Live it already logged
/// in a previous run for a stream that's still ongoing (see scheduler.rs's bootstrap step).
pub fn latest_status_per_streamer(conn: &Connection) -> rusqlite::Result<Vec<LatestStatus>> {
    let mut stmt = conn.prepare(
        "SELECT streamer_user_id, event_type, created_at, category, title
         FROM notifications
         WHERE event_type IN ('go_live', 'go_offline')
           AND id IN (
             SELECT MAX(id) FROM notifications
             WHERE event_type IN ('go_live', 'go_offline')
             GROUP BY streamer_user_id
           )",
    )?;
    let rows = stmt.query_map([], |row| {
        let event_type: String = row.get(1)?;
        Ok(LatestStatus {
            user_id: row.get(0)?,
            is_live: event_type == "go_live",
            created_at: row.get(2)?,
            category: row.get(3)?,
            title: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub struct LatestMetadataChange {
    pub user_id: i64,
    pub created_at: i64,
    pub new_title: Option<String>,
    pub new_category: Option<String>,
}

/// The most recent Metadata Change per streamer, used (only if it's newer than that
/// streamer's latest go_live) to refine the go_live snapshot's title/category baseline.
pub fn latest_metadata_change_per_streamer(conn: &Connection) -> rusqlite::Result<Vec<LatestMetadataChange>> {
    let mut stmt = conn.prepare(
        "SELECT streamer_user_id, created_at, new_title, new_category
         FROM notifications
         WHERE event_type = 'metadata_change'
           AND id IN (
             SELECT MAX(id) FROM notifications WHERE event_type = 'metadata_change' GROUP BY streamer_user_id
           )",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(LatestMetadataChange {
            user_id: row.get(0)?,
            created_at: row.get(1)?,
            new_title: row.get(2)?,
            new_category: row.get(3)?,
        })
    })?;
    rows.collect()
}
