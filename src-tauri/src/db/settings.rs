use rusqlite::Connection;

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
