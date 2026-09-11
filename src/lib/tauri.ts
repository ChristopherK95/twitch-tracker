import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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
}

/** Mirrors src-tauri/src/twitch/mod.rs::ChannelSearchResult. */
export interface ChannelSearchResult {
  user_id: number;
  login: string;
  display_name: string;
  thumbnail_url: string;
}

export const commands = {
  getWatchlist: () => invoke<WatchlistEntry[]>("get_watchlist"),
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
};

export function onAuthStatusChanged(
  handler: (status: AuthStatus) => void,
): Promise<UnlistenFn> {
  return listen<AuthStatus>("auth-status-changed", (event) => handler(event.payload));
}
