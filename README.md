# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Linux build requirements

Beyond the [standard Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux), you need `gst-plugins-good` installed. Without it, WebKitGTK can't find a GStreamer `autoaudiosink` at startup, which crashes the webview's renderer process and leaves the window blank (no error dialog, just silence — check `journalctl`/stderr for `GLib-GObject-CRITICAL` and `autoaudiosink not found` to confirm this is the cause).

```sh
# Arch
sudo pacman -S gst-plugins-good

# Debian/Ubuntu
sudo apt install gstreamer1.0-plugins-good
```
