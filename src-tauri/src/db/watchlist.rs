use super::models::WatchedStreamerRow;
use rusqlite::Connection;

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<WatchedStreamerRow>> {
    let mut stmt = conn.prepare(
        "SELECT user_id, login, display_name, profile_image_url, added_at, last_live_at, click_count
         FROM watched_streamers",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(WatchedStreamerRow {
            user_id: row.get(0)?,
            login: row.get(1)?,
            display_name: row.get(2)?,
            profile_image_url: row.get(3)?,
            added_at: row.get(4)?,
            last_live_at: row.get(5)?,
            click_count: row.get(6)?,
        })
    })?;
    rows.collect()
}
