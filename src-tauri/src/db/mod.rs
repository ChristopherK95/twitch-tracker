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

const MIGRATION_0001: &str = include_str!("../../migrations/0001_init.sql");

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
    let applied: i64 = conn.query_row(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
        [],
        |row| row.get(0),
    )?;
    if applied == 0 {
        conn.execute_batch(MIGRATION_0001)?;
        conn.execute("INSERT INTO schema_migrations (version) VALUES (1)", [])?;
    }
    Ok(())
}
