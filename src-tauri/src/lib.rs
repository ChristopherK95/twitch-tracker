mod auth;
mod commands;
mod db;
mod live_cache;
mod scheduler;
mod tray;
mod twitch;

use auth::AuthState;
use db::Db;
use live_cache::LiveCache;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: focuses the existing window instead of letting a
        // second launch spawn a duplicate instance/poller.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_and_focus(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("twitchtrack.sqlite");

            let conn = db::open(&db_path)?;

            app.manage(Db(Mutex::new(conn)));
            app.manage(reqwest::Client::new());
            app.manage(AuthState::initial());
            app.manage(LiveCache::default());

            tray::setup(app.handle())?;

            // Closing the window hides it to the tray instead of quitting — a real
            // "Quit" lives in the tray menu. The first time this happens, show a
            // one-time explainer so it doesn't look like the app just silently failed
            // to close.
            if let Some(window) = app.get_webview_window("main") {
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                        maybe_show_tray_explainer(&handle);
                    }
                });
            }

            // If a token is already stored (from a previous run), resolve real auth
            // status in the background rather than blocking startup on a network call.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                resolve_stored_auth_on_startup(handle).await;
            });

            scheduler::spawn(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_watchlist,
            commands::get_notifications,
            commands::clear_notifications,
            commands::get_auth_status,
            commands::start_connect_flow,
            commands::disconnect,
            commands::search_channels,
            commands::add_watched_streamer,
            commands::open_stream,
            commands::get_settings,
            commands::set_notification_toggle,
            commands::set_start_on_login,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn maybe_show_tray_explainer(app: &tauri::AppHandle) {
    let db = app.state::<Db>();
    let already_shown = {
        let Ok(conn) = db.0.lock() else { return };
        db::settings::has_shown_tray_explainer(&conn).unwrap_or(true)
    };
    if already_shown {
        return;
    }
    if let Ok(conn) = db.0.lock() {
        let _ = db::settings::mark_tray_explainer_shown(&conn);
    }
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("TwitchTrack is still running")
        .body("Look for it in your system tray — it keeps watching your Watchlist in the background.")
        .show();
}

async fn resolve_stored_auth_on_startup(app: tauri::AppHandle) {
    let Some(mut token) = auth::load() else {
        return;
    };
    let http = app.state::<reqwest::Client>();

    if token.needs_refresh() {
        match twitch::refresh_token(&http, &token.refresh_token).await {
            Ok(resp) => {
                token = auth::StoredToken::from_token_response(resp);
                let _ = auth::save(&token);
            }
            Err(e) => {
                eprintln!("startup token refresh failed, treating as disconnected: {e}");
                auth::set_disconnected(&app);
                return;
            }
        }
    }

    match twitch::get_self(&http, &token.access_token).await {
        Ok(me) => {
            let status = auth::AuthStatus::Connected {
                login: me.login,
                user_id: me.user_id,
            };
            let state = app.state::<AuthState>();
            if let Ok(mut guard) = state.0.lock() {
                *guard = status.clone();
            }
            tray::set_disconnected_indicator(&app, false);
            let _ = app.emit("auth-status-changed", &status);
        }
        Err(e) => {
            eprintln!("startup identity check failed, treating as disconnected: {e}");
        }
    }
}
