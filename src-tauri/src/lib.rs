mod commands;
mod db;
mod mock_live_state;

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

            #[cfg(debug_assertions)]
            {
                if db::watchlist::is_empty(&conn)? {
                    db::watchlist::seed_dev_data(&conn)?;
                }
            }

            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::get_watchlist])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
