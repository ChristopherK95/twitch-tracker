mod auth;
mod commands;
mod db;
mod twitch;

use auth::AuthState;
use db::Db;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("twitchtrack.sqlite");

            let conn = db::open(&db_path)?;

            app.manage(Db(Mutex::new(conn)));
            app.manage(reqwest::Client::new());
            app.manage(AuthState::initial());

            // If a token is already stored (from a previous run), resolve real auth
            // status in the background rather than blocking startup on a network call.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                resolve_stored_auth_on_startup(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_watchlist,
            commands::get_auth_status,
            commands::start_connect_flow,
            commands::disconnect,
            commands::search_channels,
            commands::add_watched_streamer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn resolve_stored_auth_on_startup(app: tauri::AppHandle) {
    use tauri::Emitter;

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
                let _ = auth::clear();
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
            let _ = app.emit("auth-status-changed", &status);
        }
        Err(e) => {
            eprintln!("startup identity check failed, treating as disconnected: {e}");
        }
    }
}
