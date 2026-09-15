use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub mod models;
pub mod notifications;
pub mod settings;
pub mod watchlist;

/// Shared handle to the app's single SQLite connection. Guarded by a mutex since the
/// scheduler (background task) and frontend-facing commands both need access; SQLite
/// itself only supports one writer at a time regardless; see
/// .scratch/twitchtrack-v1-spec/issues/02-sqlite-schema.md for the schema this owns.
pub struct Db(pub Mutex<Connection>);

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../../migrations/0001_init.sql")),
    (2, include_str!("../../migrations/0002_tray_explainer.sql")),
    (3, include_str!("../../migrations/0003_twitch_profile_image.sql")),
    (4, include_str!("../../migrations/0004_split_combined_metadata_changes.sql")),
];

pub fn open(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    run_migrations(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);",
    )?;
    for (version, sql) in MIGRATIONS {
        let applied: i64 = conn.query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = ?1",
            [version],
            |row| row.get(0),
        )?;
        if applied == 0 {
            conn.execute_batch(sql)?;
            conn.execute("INSERT INTO schema_migrations (version) VALUES (?1)", [version])?;
        }
    }
    Ok(())
}
