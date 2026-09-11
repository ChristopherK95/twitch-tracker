use crate::auth::{self, AuthState, AuthStatus, StoredToken};
use crate::db::{watchlist, Db};
use crate::twitch;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Combined view model the frontend renders — durable identity (DB) plus live state
/// (a real one-shot Get Streams call when connected; empty when not — the continuous
/// polling scheduler that keeps this fresh automatically lands in milestone 3).
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
pub async fn get_watchlist(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
) -> Result<Vec<WatchlistEntry>, String> {
    let rows = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        watchlist::list(&conn).map_err(|e| e.to_string())?
    };

    let live = match auth::get_valid_access_token(&http).await {
        Ok(token) => {
            let ids: Vec<i64> = rows.iter().map(|r| r.user_id).collect();
            twitch::get_streams(&http, &token, &ids)
                .await
                .map_err(|e| e.to_string())?
        }
        Err(_) => vec![], // not connected yet — everyone reads as offline
    };

    let mut entries: Vec<WatchlistEntry> = rows
        .into_iter()
        .map(|r| {
            let live_state = live.iter().find(|s| s.user_id == r.user_id);
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

    // Settled ordering: live streamers first (click_count DESC, view_count DESC),
    // then offline streamers by last_live_at DESC (nulls/never-live last).
    entries.sort_by(|a, b| match (a.is_live, b.is_live) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        (true, true) => b
            .click_count
            .cmp(&a.click_count)
            .then_with(|| b.view_count.unwrap_or(0).cmp(&a.view_count.unwrap_or(0))),
        (false, false) => b
            .last_live_at
            .unwrap_or(i64::MIN)
            .cmp(&a.last_live_at.unwrap_or(i64::MIN)),
    });

    Ok(entries)
}

#[tauri::command]
pub fn get_auth_status(auth_state: State<'_, AuthState>) -> Result<AuthStatus, String> {
    Ok(auth_state.0.lock().map_err(|e| e.to_string())?.clone())
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectStarted {
    pub user_code: String,
    pub verification_uri: String,
}

/// Kicks off Device Code Grant: fetches a device code, flips auth state to `Connecting`,
/// then spawns a background poller that resolves to `Connected` or back to `Disconnected`
/// (on expiry/error) and emits `auth-status-changed` either way.
#[tauri::command]
pub async fn start_connect_flow(
    app: AppHandle,
    http: State<'_, reqwest::Client>,
    auth_state: State<'_, AuthState>,
) -> Result<ConnectStarted, String> {
    let device = twitch::request_device_code(&http)
        .await
        .map_err(|e| e.to_string())?;

    let connecting = AuthStatus::Connecting {
        user_code: device.user_code.clone(),
        verification_uri: device.verification_uri.clone(),
    };
    *auth_state.0.lock().map_err(|e| e.to_string())? = connecting.clone();
    let _ = app.emit("auth-status-changed", &connecting);

    let response = ConnectStarted {
        user_code: device.user_code.clone(),
        verification_uri: device.verification_uri.clone(),
    };

    let http = http.inner().clone();
    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        poll_until_resolved(app_for_task, http, device).await;
    });

    Ok(response)
}

async fn poll_until_resolved(app: AppHandle, http: reqwest::Client, device: twitch::DeviceCodeResponse) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(device.expires_in as u64);
    let interval = std::time::Duration::from_secs(device.interval.max(1) as u64);

    loop {
        if std::time::Instant::now() >= deadline {
            let status = AuthStatus::Disconnected;
            let _ = app.emit("auth-status-changed", &status);
            return;
        }
        tokio::time::sleep(interval).await;
        match twitch::poll_device_token(&http, &device.device_code).await {
            Ok(twitch::PollOutcome::Pending) => continue,
            Ok(twitch::PollOutcome::Expired) => {
                let status = AuthStatus::Disconnected;
                let _ = app.emit("auth-status-changed", &status);
                return;
            }
            Ok(twitch::PollOutcome::Success(token_resp)) => {
                let stored = StoredToken::from_token_response(token_resp);
                if let Err(e) = auth::save(&stored) {
                    eprintln!("failed to save token to keychain: {e}");
                    return;
                }
                let me = match twitch::get_self(&http, &stored.access_token).await {
                    Ok(me) => me,
                    Err(e) => {
                        eprintln!("failed to fetch connected user identity: {e}");
                        return;
                    }
                };
                let db_state: State<'_, Db> = app.state();
                if let Ok(conn) = db_state.0.lock() {
                    let _ = conn.execute(
                        "UPDATE settings SET twitch_user_id = ?1, twitch_login = ?2 WHERE id = 1",
                        rusqlite::params![me.user_id.to_string(), me.login],
                    );
                }
                let status = AuthStatus::Connected {
                    login: me.login,
                    user_id: me.user_id,
                };
                let app_state: State<'_, AuthState> = app.state();
                if let Ok(mut guard) = app_state.0.lock() {
                    *guard = status.clone();
                }
                let _ = app.emit("auth-status-changed", &status);
                return;
            }
            Err(e) => {
                eprintln!("device token poll error: {e}");
                continue;
            }
        }
    }
}

#[tauri::command]
pub fn disconnect(app: AppHandle, auth_state: State<'_, AuthState>) -> Result<(), String> {
    auth::clear().map_err(|e| e.to_string())?;
    let status = AuthStatus::Disconnected;
    *auth_state.0.lock().map_err(|e| e.to_string())? = status.clone();
    let _ = app.emit("auth-status-changed", &status);
    Ok(())
}

#[tauri::command]
pub async fn search_channels(
    http: State<'_, reqwest::Client>,
    query: String,
) -> Result<Vec<twitch::ChannelSearchResult>, String> {
    let token = auth::get_valid_access_token(&http)
        .await
        .map_err(|e| e.to_string())?;
    twitch::search_channels(&http, &token, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_watched_streamer(
    db: State<'_, Db>,
    user_id: i64,
    login: String,
    display_name: String,
    profile_image_url: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    conn.execute(
        "INSERT OR IGNORE INTO watched_streamers (user_id, login, display_name, profile_image_url, added_at, click_count)
         VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        rusqlite::params![user_id, login, display_name, profile_image_url, now],
    )
    .map_err(|e| e.to_string())?;
    if conn.changes() == 0 {
        eprintln!(
            "add_watched_streamer: no row inserted for user_id={user_id} login={login} — \
             a row with that user_id already exists (INSERT OR IGNORE no-op)"
        );
    }
    Ok(())
}
