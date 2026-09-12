//! System tray. Source of record: .scratch/twitchtrack-v1-spec/issues/01-tauri-capabilities-research.md
//! and issues/06-settings-lifecycle-prototype.md ("Card Dashboard").
//!
//! Tray icon click and the "Show TwitchTrack" menu item both focus the main window;
//! "Quit" actually exits (closing the window itself just hides it — see lib.rs's
//! close-requested handler). The disconnected state is indicated via tooltip text —
//! a real badge would need a second icon asset, which this app doesn't have yet.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub struct Tray(pub TrayIcon);

const TOOLTIP_CONNECTED: &str = "TwitchTrack";
const TOOLTIP_DISCONNECTED: &str = "TwitchTrack — disconnected, reconnect in Settings";

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show TwitchTrack", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip(TOOLTIP_CONNECTED)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_and_focus(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_and_focus(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(Tray(tray));
    Ok(())
}

pub fn show_and_focus(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn set_disconnected_indicator(app: &AppHandle, disconnected: bool) {
    if let Some(tray) = app.try_state::<Tray>() {
        let tooltip = if disconnected { TOOLTIP_DISCONNECTED } else { TOOLTIP_CONNECTED };
        let _ = tray.0.set_tooltip(Some(tooltip));
    }
}
