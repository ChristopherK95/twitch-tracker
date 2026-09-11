# Research: Tauri capabilities for tray, notifications, autostart, single-instance

Type: research
Status: resolved
Blocked by: (none)

## Question

The map's standing decisions require: a tray-resident app (closing/minimizing hides to a system tray icon, with a "Quit" option), clicking a desktop notification focuses the app and jumps to the relevant Watched Streamer, a "start on login" Settings toggle, and (implicitly, since the app is tray-resident) single-instance enforcement so a second launch doesn't spawn a duplicate poller.

Research Tauri's actual plugin/API support for each of these, so the prototype tickets for Settings and the app lifecycle can design against real constraints rather than assumptions:

1. System tray: which Tauri API/plugin provides the tray icon + menu, and what menu/event capabilities does it expose (e.g. can a menu item distinguish "hide" from "quit")?
2. Native desktop notifications: does Tauri's notification plugin support a click handler that can carry data (e.g. which Watched Streamer to jump to) and bring the window to focus?
3. Start on login: is there an official autostart plugin, and what are its platform caveats (Windows/macOS/Linux differences, if any matter for this project)?
4. Single-instance enforcement: is there an official plugin/pattern to prevent a second instance from launching (and instead focus the existing window)?

Cite the specific Tauri plugin docs used. Keep the report focused on capabilities/constraints, not on designing the UI around them (that's for the prototype tickets).

## Answer

Full findings: [research/01-tauri-capabilities.md](../research/01-tauri-capabilities.md).

1. **Tray**: core `tauri` crate (`tray-icon` feature), `TrayIconBuilder` + `menu::Menu`. Menu items distinguished by string `id` in `on_menu_event` — "Hide" vs "Quit" is trivial. Tray icon clicks are a separate `on_tray_icon_event` (Click/DoubleClick/etc.), the usual hook for "click tray icon to show/focus window."
2. **Notification click-to-focus is not deliverable on desktop.** `tauri-plugin-notification`'s action/click system (`registerActionTypes`/`onAction`, including foreground-on-tap) is mobile-only per the plugin's own docs, and confirmed in source: the desktop backend (wrapping `notify-rust`) shows the notification and wires no click callback back to the frontend at all. **This contradicts the map's standing decision** that "clicking a desktop notification focuses the app and jumps to that streamer." That specific behavior needs to be dropped or replaced — the tray icon click event or the single-instance focus mechanism are the realistic alternatives, but neither can carry "jump to this specific streamer" data the way a notification click was assumed to. Flagged for the Settings/lifecycle prototype ticket to resolve.
3. **Autostart**: official `tauri-plugin-autostart`, Windows/macOS/Linux, `enable()/disable()/isEnabled()`, per-platform mechanism handled internally (registry / LaunchAgent plist / XDG `.desktop`).
4. **Single-instance**: official `tauri-plugin-single-instance`, must be registered first in the builder. Callback receives the second launch's args/cwd; standard pattern is calling `set_focus()` on the existing window from that callback. Linux uses DBus; Flatpak/Snap need an explicit `DBUS_ID`.

