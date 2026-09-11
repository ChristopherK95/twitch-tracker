use super::models::WatchedStreamerRow;
use rusqlite::{params, Connection};

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

/// Dev-only convenience: seed a few Watched Streamers so milestone 1 has something to
/// render before real Twitch search/auth exists (milestone 2). Guarded by the caller to
/// debug builds and an empty table.
pub fn seed_dev_data(conn: &Connection) -> rusqlite::Result<()> {
    let now = now_unix();
    let day = 86_400;
    let rows: [(i64, &str, &str, i64, Option<i64>, i64); 8] = [
        (37402112, "shroud", "shroud", now - 3600, Some(now - 1800), 42),
        (44445592, "pokimane", "pokimane", now - 3600, Some(now - 900), 31),
        (91018828, "moistcr1tikal", "moistcr1tikal", now - 3600, Some(now - 3600), 12),
        (207813352, "hasanabi", "HasanAbi", now - 3600, Some(now - 10800), 5),
        (24147592, "ludwig", "ludwig", now - 7200, Some(now - 2 * 3600), 18),
        (26301881, "asmongold", "Asmongold", now - 7200, Some(now - day), 9),
        (13235845, "xqc", "xQc", now - 7200, Some(now - 3 * day), 27),
        (26490481, "summit1g", "summit1g", now - 7200, None, 0),
    ];
    for (user_id, login, display_name, added_at, last_live_at, click_count) in rows {
        conn.execute(
            "INSERT INTO watched_streamers (user_id, login, display_name, added_at, last_live_at, click_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![user_id, login, display_name, added_at, last_live_at, click_count],
        )?;
    }
    Ok(())
}

pub fn is_empty(conn: &Connection) -> rusqlite::Result<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM watched_streamers", [], |r| r.get(0))?;
    Ok(count == 0)
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
