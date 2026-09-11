//! TEMPORARY stand-in for the polling scheduler's in-memory live-state cache
//! (.scratch/twitchtrack-v1-spec/issues/03-polling-scheduler.md). Milestone 1 only —
//! delete this module once milestone 3 wires up the real scheduler, which will own this
//! same shape of data (is_live/category/title/view_count/started_at) for real.

use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct MockLiveState {
    pub category: String,
    pub title: String,
    pub view_count: i64,
    pub started_at: i64, // unix epoch seconds
}

pub fn all() -> HashMap<i64, MockLiveState> {
    let now = now_unix();
    let mut m = HashMap::new();
    m.insert(
        37402112,
        MockLiveState {
            category: "VALORANT".into(),
            title: "ranked grind, road to radiant".into(),
            view_count: 18320,
            started_at: now - 137 * 60,
        },
    );
    m.insert(
        44445592,
        MockLiveState {
            category: "Just Chatting".into(),
            title: "cozy stream + variety games tonight".into(),
            view_count: 24500,
            started_at: now - 62 * 60,
        },
    );
    m.insert(
        91018828,
        MockLiveState {
            category: "Just Chatting".into(),
            title: "watching movies with chat".into(),
            view_count: 9760,
            started_at: now - 205 * 60,
        },
    );
    m
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
