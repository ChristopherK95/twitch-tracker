#!/usr/bin/env bash
# Installs the already-built release binary as a launcher-visible app on Linux.
# Run `pnpm tauri build` first — this script only copies what that produced.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin_src="$root_dir/src-tauri/target/release/twitchtrack"
icon_src="$root_dir/src-tauri/icons/icon.png"

if [[ ! -x "$bin_src" ]]; then
    echo "error: $bin_src not found — run 'pnpm tauri build' first" >&2
    exit 1
fi

bin_dir="$HOME/.local/bin"
icon_dir="$HOME/.local/share/icons/hicolor/512x512/apps"
apps_dir="$HOME/.local/share/applications"

mkdir -p "$bin_dir" "$icon_dir" "$apps_dir"
cp "$bin_src" "$bin_dir/twitchtrack"
cp "$icon_src" "$icon_dir/twitchtrack.png"

cat > "$apps_dir/twitchtrack.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=TwitchTrack
Comment=Watch your Twitch streamers and get notified when they go live
Exec=$bin_dir/twitchtrack
Icon=twitchtrack
Terminal=false
Categories=Network;
StartupWMClass=twitchtrack
EOF

command -v update-desktop-database >/dev/null && update-desktop-database "$apps_dir" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

echo "Installed to $bin_dir/twitchtrack — TwitchTrack should now appear in your app launcher."
