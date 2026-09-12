//! The scheduler's in-memory live-state cache — the durable/persisted side lives in
//! SQLite (identity, click_count, last_live_at); this holds what's deliberately never
//! persisted (status/viewers/title/category/session timing), re-derived every poll.
//! See .scratch/twitchtrack-v1-spec/issues/02-sqlite-schema.md and issues/03.

use std::collections::HashMap;
use std::sync::RwLock;

#[derive(Debug, Clone)]
pub struct LiveEntry {
    pub category: String,
    pub title: String,
    pub view_count: i64,
    pub started_at: i64, // unix epoch seconds
    pub thumbnail_url: String,
}

#[derive(Default)]
pub struct LiveCache(pub RwLock<HashMap<i64, LiveEntry>>);

impl LiveCache {
    pub fn snapshot(&self) -> HashMap<i64, LiveEntry> {
        self.0.read().unwrap().clone()
    }

    pub fn replace(&self, fresh: HashMap<i64, LiveEntry>) {
        *self.0.write().unwrap() = fresh;
    }

    /// Updates a single streamer's entry without touching the rest of the cache — used
    /// for an instant one-off check (e.g. right after adding a streamer) rather than
    /// waiting for the scheduler's next full tick. `None` means offline/not found.
    pub fn upsert_one(&self, user_id: i64, entry: Option<LiveEntry>) {
        let mut guard = self.0.write().unwrap();
        match entry {
            Some(e) => {
                guard.insert(user_id, e);
            }
            None => {
                guard.remove(&user_id);
            }
        }
    }
}
