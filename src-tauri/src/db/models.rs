use serde::Serialize;

/// A row from `watched_streamers` — durable identity data only. Live status, view count,
/// title, category, and session timing are never persisted (see
/// .scratch/twitchtrack-v1-spec/issues/02-sqlite-schema.md); those come from the scheduler's
/// in-memory cache once it exists (milestone 3), stood in for by `mock_live_state` until then.
#[derive(Debug, Clone, Serialize)]
pub struct WatchedStreamerRow {
    pub user_id: i64,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: Option<String>,
    pub added_at: i64,
    pub last_live_at: Option<i64>,
    pub click_count: i64,
}
