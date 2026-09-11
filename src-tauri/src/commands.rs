use crate::db::{watchlist, Db};
use crate::mock_live_state;
use serde::Serialize;
use tauri::State;

/// Combined view model the frontend renders — durable identity (DB) plus live state
/// (in-memory; mocked until milestone 3's scheduler exists for real).
#[derive(Debug, Clone, Serialize)]
pub struct WatchlistEntry {
    pub user_id: i64,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: Option<String>,
    pub click_count: i64,
    pub last_live_at: Option<i64>,
    pub is_live: bool,
    pub category: Option<String>,
    pub title: Option<String>,
    pub view_count: Option<i64>,
    pub started_at: Option<i64>,
}

#[tauri::command]
pub fn get_watchlist(db: State<'_, Db>) -> Result<Vec<WatchlistEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let rows = watchlist::list(&conn).map_err(|e| e.to_string())?;
    let live = mock_live_state::all();

    let mut entries: Vec<WatchlistEntry> = rows
        .into_iter()
        .map(|r| {
            let live_state = live.get(&r.user_id);
            WatchlistEntry {
                user_id: r.user_id,
                login: r.login,
                display_name: r.display_name,
                profile_image_url: r.profile_image_url,
                click_count: r.click_count,
                last_live_at: r.last_live_at,
                is_live: live_state.is_some(),
                category: live_state.map(|s| s.category.clone()),
                title: live_state.map(|s| s.title.clone()),
                view_count: live_state.map(|s| s.view_count),
                started_at: live_state.map(|s| s.started_at),
            }
        })
        .collect();

    // Per the settled ordering rule: live streamers first (click_count DESC, view_count DESC),
    // then offline streamers by last_live_at DESC (nulls/never-live last).
    entries.sort_by(|a, b| {
        match (a.is_live, b.is_live) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            (true, true) => b
                .click_count
                .cmp(&a.click_count)
                .then_with(|| b.view_count.unwrap_or(0).cmp(&a.view_count.unwrap_or(0))),
            (false, false) => b.last_live_at.unwrap_or(i64::MIN).cmp(&a.last_live_at.unwrap_or(i64::MIN)),
        }
    });

    Ok(entries)
}
