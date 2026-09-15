import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

/** Opens a URL in the OS default browser (e.g. Twitch's device-code activation page). */
export function openInBrowser(url: string): Promise<void> {
  return openUrl(url);
}

/** Mirrors src-tauri/src/auth.rs::AuthStatus (serde tag = "status"). */
export type AuthStatus =
  | { status: "disconnected" }
  | { status: "connecting"; user_code: string; verification_uri: string }
  | { status: "connected"; login: string; user_id: number };

export interface ConnectStarted {
  user_code: string;
  verification_uri: string;
}

/** Mirrors src-tauri/src/commands.rs::WatchlistEntry. */
export interface WatchlistEntry {
  user_id: number;
  login: string;
  display_name: string;
  profile_image_url: string | null;
  click_count: number;
  last_live_at: number | null;
  is_live: boolean;
  category: string | null;
  title: string | null;
  view_count: number | null;
  started_at: number | null;
  stream_thumbnail_url: string | null;
}

/** Mirrors src-tauri/src/twitch/mod.rs::ChannelSearchResult. */
export interface ChannelSearchResult {
  user_id: number;
  login: string;
  display_name: string;
  thumbnail_url: string;
}

/** Mirrors src-tauri/src/db/notifications.rs::NotificationRow. */
export interface NotificationRow {
  id: number;
  event_type: "go_live" | "go_offline" | "metadata_change";
  streamer_user_id: number;
  streamer_login: string;
  streamer_display_name: string;
  created_at: number;
  category: string | null;
  title: string | null;
  duration_seconds: number | null;
  old_title: string | null;
  new_title: string | null;
  old_category: string | null;
  new_category: string | null;
  streamer_profile_image_url: string | null;
}

/** Mirrors src-tauri/src/db/settings.rs::SettingsRow. */
export interface SettingsRow {
  notify_go_live: boolean;
  notify_go_offline: boolean;
  notify_metadata_change: boolean;
  start_on_login: boolean;
  twitch_login: string | null;
  twitch_profile_image_url: string | null;
}

export type NotificationKind = "go_live" | "go_offline" | "metadata_change";

export const commands = {
  getWatchlist: () => invoke<WatchlistEntry[]>("get_watchlist"),
  getNotifications: () => invoke<NotificationRow[]>("get_notifications"),
  clearNotifications: () => invoke<void>("clear_notifications"),
  getAuthStatus: () => invoke<AuthStatus>("get_auth_status"),
  startConnectFlow: () => invoke<ConnectStarted>("start_connect_flow"),
  disconnect: () => invoke<void>("disconnect"),
  searchChannels: (query: string) =>
    invoke<ChannelSearchResult[]>("search_channels", { query }),
  addWatchedStreamer: (streamer: {
    user_id: number;
    login: string;
    display_name: string;
    profile_image_url: string | null;
  }) =>
    // Tauri auto-converts a Rust command's snake_case params to camelCase for JS callers —
    // only invoke-argument keys need this, not the snake_case response payloads above.
    invoke<void>("add_watched_streamer", {
      userId: streamer.user_id,
      login: streamer.login,
      displayName: streamer.display_name,
      profileImageUrl: streamer.profile_image_url,
    }),
  openStream: (userId: number, login: string) =>
    invoke<void>("open_stream", { userId, login }),
  getSettings: () => invoke<SettingsRow>("get_settings"),
  setNotificationToggle: (kind: NotificationKind, enabled: boolean) =>
    invoke<void>("set_notification_toggle", { kind, enabled }),
  setStartOnLogin: (enabled: boolean) => invoke<void>("set_start_on_login", { enabled }),
  /** Dev-only — errors out in a release build. See commands::simulate_notification. */
  simulateNotification: (kind: NotificationKind) =>
    invoke<void>("simulate_notification", { kind }),
};

export function onAuthStatusChanged(
  handler: (status: AuthStatus) => void,
): Promise<UnlistenFn> {
  return listen<AuthStatus>("auth-status-changed", (event) => handler(event.payload));
}

/** Mirrors scheduler.rs::NotificationCreated. One event is emitted per Notification row
 *  written — a tick that logs a title AND a category change emits two, one for each. */
export interface NotificationCreatedEvent {
  user_id: number;
  display_name: string;
  event_type: NotificationKind;
  category: string | null;
  title: string | null;
  duration_seconds: number | null;
  old_title: string | null;
  new_title: string | null;
  old_category: string | null;
  new_category: string | null;
}

/** Fires whenever the scheduler writes a Notification. */
export function onNotificationCreated(
  handler: (event: NotificationCreatedEvent) => void,
): Promise<UnlistenFn> {
  return listen<NotificationCreatedEvent>("notification-created", (event) => handler(event.payload));
}

/** Fires every scheduler tick (~20s) — view counts etc. change even with no Notification. */
export function onLiveStateUpdated(handler: () => void): Promise<UnlistenFn> {
  return listen("live-state-updated", () => handler());
}
