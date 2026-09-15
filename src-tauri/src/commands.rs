use crate::auth::{self, AuthState, AuthStatus, StoredToken};
use crate::db::{notifications, settings, watchlist, Db};
use crate::live_cache::{LiveCache, LiveEntry};
use crate::twitch;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Combined view model the frontend renders — durable identity (DB) plus live state
/// (read from the scheduler's in-memory cache, kept fresh every ~20s poll; see
/// scheduler.rs — this command never talks to Twitch itself).
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
    pub stream_thumbnail_url: Option<String>,
}

#[tauri::command]
pub fn get_watchlist(db: State<'_, Db>, cache: State<'_, LiveCache>) -> Result<Vec<WatchlistEntry>, String> {
    let rows = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        watchlist::list(&conn).map_err(|e| e.to_string())?
    };
    let live = cache.snapshot();

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
                stream_thumbnail_url: live_state.map(|s| s.thumbnail_url.clone()),
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
pub fn get_notifications(db: State<'_, Db>) -> Result<Vec<notifications::NotificationRow>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    notifications::list(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_notifications(db: State<'_, Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    notifications::clear_all(&conn).map_err(|e| e.to_string())?;
    Ok(())
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
                    let _ = crate::db::settings::set_twitch_identity(
                        &conn,
                        &me.user_id.to_string(),
                        &me.login,
                        &me.profile_image_url,
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
pub fn disconnect(app: AppHandle) -> Result<(), String> {
    auth::set_disconnected(&app);
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
pub async fn add_watched_streamer(
    db: State<'_, Db>,
    http: State<'_, reqwest::Client>,
    cache: State<'_, LiveCache>,
    user_id: i64,
    login: String,
    display_name: String,
    profile_image_url: Option<String>,
) -> Result<(), String> {
    {
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
    }

    // Instant one-off live check for just this streamer, so the Watchlist shows their
    // real status right away instead of waiting for the scheduler's next ~20s tick.
    // The scheduler's own next tick still handles Go-Live detection/logging normally —
    // this only updates what's displayed in the meantime.
    if let Ok(token) = auth::get_valid_access_token(&http).await {
        let is_live = if let Ok(streams) = twitch::get_streams(&http, &token, &[user_id]).await {
            let live_entry = streams.into_iter().next().map(|s| LiveEntry {
                category: s.category,
                title: s.title,
                view_count: s.view_count,
                started_at: s.started_at,
                thumbnail_url: s.thumbnail_url,
            });
            let is_live = live_entry.is_some();
            cache.upsert_one(user_id, live_entry);
            is_live
        } else {
            false
        };

        // Offline and we have no local last-live history for them (a fresh add, or one
        // whose history predates this row) — best-effort backfill from their most recent
        // VOD. Twitch has no authoritative "last live" field; this legitimately comes back
        // empty for plenty of channels (see twitch::get_last_broadcast_at), which is fine —
        // it just leaves last_live_at as-is ("not yet live") rather than making anything up.
        if !is_live {
            if let Ok(Some(last_live_at)) = twitch::get_last_broadcast_at(&http, &token, user_id).await {
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                let _ = conn.execute(
                    "UPDATE watched_streamers SET last_live_at = ?1 WHERE user_id = ?2 AND last_live_at IS NULL",
                    rusqlite::params![last_live_at, user_id],
                );
            }
        }
    }

    Ok(())
}

/// Clicking a Watched Streamer's name: opens their channel in the OS default browser
/// and increments click_count (used for the Watchlist's live-ranking order).
#[tauri::command]
pub fn open_stream(app: AppHandle, db: State<'_, Db>, user_id: i64, login: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE watched_streamers SET click_count = click_count + 1 WHERE user_id = ?1",
            rusqlite::params![user_id],
        )
        .map_err(|e| e.to_string())?;
    }

    app.opener()
        .open_url(format!("https://twitch.tv/{login}"), None::<&str>)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_settings(db: State<'_, Db>) -> Result<settings::SettingsRow, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    settings::get(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_notification_toggle(db: State<'_, Db>, kind: String, enabled: bool) -> Result<(), String> {
    let parsed = match kind.as_str() {
        "go_live" => settings::NotificationKind::GoLive,
        "go_offline" => settings::NotificationKind::GoOffline,
        "metadata_change" => settings::NotificationKind::MetadataChange,
        other => return Err(format!("unknown notification kind: {other}")),
    };
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    settings::set_notification_toggle(&conn, parsed, enabled).map_err(|e| e.to_string())
}

/// Dev-only: writes a fake Notification (against the first real Watched Streamer, if any)
/// and emits `notification-created` exactly as the scheduler would, so the frontend's
/// sound/highlight/refresh reaction can be exercised without waiting for a real Twitch
/// event. Inert in release builds — `cfg!(debug_assertions)` is `false` there, so this
/// just returns an error instead of writing anything.
#[tauri::command]
pub fn simulate_notification(app: AppHandle, db: State<'_, Db>, kind: String) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("simulate_notification is only available in dev builds".to_string());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let target = watchlist::list(&conn).ok().and_then(|rows| rows.into_iter().next());
    let (user_id, login, display_name) = match &target {
        Some(r) => (r.user_id, r.login.as_str(), r.display_name.as_str()),
        None => (-1, "dev_streamer", "Dev Streamer"),
    };

    let payload = match kind.as_str() {
        "go_live" => {
            let category = "Just Chatting".to_string();
            let title = "Simulated notification (dev only)".to_string();
            let _ = notifications::insert_go_live(
                &conn,
                &notifications::NewGoLive {
                    user_id,
                    login,
                    display_name,
                    category: &category,
                    title: &title,
                },
                now,
            );
            crate::scheduler::NotificationCreated {
                user_id,
                display_name: display_name.to_string(),
                event_type: "go_live",
                category: Some(category),
                title: Some(title),
                duration_seconds: None,
                old_title: None,
                new_title: None,
                old_category: None,
                new_category: None,
            }
        }
        "go_offline" => {
            let duration_seconds = 1830;
            let _ = notifications::insert_go_offline(
                &conn,
                &notifications::NewGoOffline {
                    user_id,
                    login,
                    display_name,
                    duration_seconds,
                },
                now,
            );
            crate::scheduler::NotificationCreated {
                user_id,
                display_name: display_name.to_string(),
                event_type: "go_offline",
                category: None,
                title: None,
                duration_seconds: Some(duration_seconds),
                old_title: None,
                new_title: None,
                old_category: None,
                new_category: None,
            }
        }
        "metadata_change" => {
            let old_title = "Old simulated title".to_string();
            let new_title = "New simulated title (dev only)".to_string();
            let _ = notifications::insert_metadata_change(
                &conn,
                &notifications::NewMetadataChange {
                    user_id,
                    login,
                    display_name,
                    old_title: Some(&old_title),
                    new_title: Some(&new_title),
                    old_category: None,
                    new_category: None,
                },
                now,
            );
            crate::scheduler::NotificationCreated {
                user_id,
                display_name: display_name.to_string(),
                event_type: "metadata_change",
                category: None,
                title: None,
                duration_seconds: None,
                old_title: Some(old_title),
                new_title: Some(new_title),
                old_category: None,
                new_category: None,
            }
        }
        other => return Err(format!("unknown notification kind: {other}")),
    };
    drop(conn);

    let _ = app.emit("notification-created", payload);
    Ok(())
}

#[tauri::command]
pub fn set_start_on_login(app: AppHandle, db: State<'_, Db>, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;

    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        settings::set_start_on_login(&conn, enabled).map_err(|e| e.to_string())?;
    }

    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}
