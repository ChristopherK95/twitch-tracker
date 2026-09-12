//! The polling scheduler. Source of record: .scratch/twitchtrack-v1-spec/issues/03-polling-scheduler.md.
//!
//! Fixed 20s tick, one batched `Get Streams` call for the whole Watchlist. Status Change
//! (Go-Live/Go-Offline) fires immediately on the first differing poll. Metadata Change
//! requires a pending-candidate value to match for 2 minutes straight before it's
//! confirmed as a Notification. Token refresh is proactive (handled by
//! `auth::get_valid_access_token`, reused here). Exponential backoff on transient
//! failures (20s -> ... -> 5min cap, reset on success). Not connected is not a failure —
//! it just skips this tick's Twitch calls with no backoff escalation.

use crate::auth;
use crate::db::{notifications, settings, watchlist, Db};
use crate::live_cache::{LiveCache, LiveEntry};
use crate::twitch::{self, StreamInfo};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const BASE_INTERVAL: Duration = Duration::from_secs(20);
const MAX_BACKOFF: Duration = Duration::from_secs(300);
const METADATA_STABILITY_WINDOW: Duration = Duration::from_secs(120);
const PRUNE_EVERY_N_TICKS: u32 = 180; // ~1 hour at the 20s base interval

#[derive(Clone)]
struct PendingMetadata {
    title: String,
    category: String,
    since: Instant,       // monotonic clock, for measuring the stability window reliably
    first_seen_unix: i64, // wall-clock time the candidate first appeared, for the eventual Notification's timestamp
}

struct StreamerTrack {
    is_live: bool,
    started_at: i64,
    confirmed_title: String,
    confirmed_category: String,
    pending: Option<PendingMetadata>,
}

impl Default for StreamerTrack {
    fn default() -> Self {
        Self {
            is_live: false,
            started_at: 0,
            confirmed_title: String::new(),
            confirmed_category: String::new(),
            pending: None,
        }
    }
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        run(app).await;
    });
}

async fn run(app: AppHandle) {
    let mut tracks: HashMap<i64, StreamerTrack> = {
        let db = app.state::<Db>();
        let conn = db.0.lock().unwrap();
        bootstrap_tracks(&conn)
    };
    let mut consecutive_failures: u32 = 0;
    let mut tick: u32 = 0;
    // First tick fires immediately — no reason to sit offline-looking for up to
    // BASE_INTERVAL after launch when we can just check right away. Every tick
    // after that waits (backoff_delay) before running.
    let mut delay = Duration::ZERO;
    // The first tick that actually gets real poll data (not "not connected") just
    // establishes what's true right now — it shouldn't announce that as if it just
    // happened. Only changes seen from the next real tick onward are Notifications.
    let mut baseline_established = false;

    loop {
        tokio::time::sleep(delay).await;
        tick = tick.wrapping_add(1);

        match tick_once(&app, &mut tracks, tick, !baseline_established).await {
            Ok(()) => {
                consecutive_failures = 0;
                baseline_established = true;
            }
            Err(TickError::NotConnected) => { /* not a failure, no backoff escalation */ }
            Err(TickError::Request(e)) => {
                eprintln!("scheduler: poll failed, backing off: {e}");
                consecutive_failures += 1;
            }
        }

        delay = backoff_delay(consecutive_failures);
    }
}

/// Reconstructs in-memory live-tracking state from the (persisted) Notification Log at
/// startup, so a streamer who's still live across an app restart doesn't get a duplicate
/// Go-Live logged the moment the scheduler's first tick finds them. Without this, every
/// track defaults to "offline", and the fresh poll seeing them live would look identical
/// to a real Go-Live edge.
fn bootstrap_tracks(conn: &rusqlite::Connection) -> HashMap<i64, StreamerTrack> {
    let mut tracks = HashMap::new();

    let statuses = notifications::latest_status_per_streamer(conn).unwrap_or_default();
    let changes = notifications::latest_metadata_change_per_streamer(conn).unwrap_or_default();
    let latest_change_by_id: HashMap<i64, notifications::LatestMetadataChange> =
        changes.into_iter().map(|c| (c.user_id, c)).collect();

    for status in statuses {
        if !status.is_live {
            continue; // latest event was go_offline — default (not live) is already correct
        }
        let mut track = StreamerTrack {
            is_live: true,
            started_at: status.created_at,
            confirmed_title: status.title.unwrap_or_default(),
            confirmed_category: status.category.unwrap_or_default(),
            pending: None,
        };
        // A Metadata Change logged after that Go-Live means the title/category baseline
        // has since moved on — refine it (only the field(s) that change actually recorded).
        if let Some(change) = latest_change_by_id.get(&status.user_id) {
            if change.created_at > status.created_at {
                if let Some(t) = &change.new_title {
                    track.confirmed_title = t.clone();
                }
                if let Some(c) = &change.new_category {
                    track.confirmed_category = c.clone();
                }
            }
        }
        tracks.insert(status.user_id, track);
    }

    tracks
}

fn backoff_delay(consecutive_failures: u32) -> Duration {
    if consecutive_failures == 0 {
        return BASE_INTERVAL;
    }
    let scaled = BASE_INTERVAL.saturating_mul(1 << consecutive_failures.min(16));
    scaled.min(MAX_BACKOFF)
}

enum TickError {
    NotConnected,
    Request(anyhow::Error),
}

async fn tick_once(
    app: &AppHandle,
    tracks: &mut HashMap<i64, StreamerTrack>,
    tick: u32,
    suppress_notifications: bool,
) -> Result<(), TickError> {
    let http = app.state::<reqwest::Client>();
    let token = match auth::get_valid_access_token(&http).await {
        Ok(t) => t,
        Err(auth::TokenError::NeverConnected) => return Err(TickError::NotConnected),
        Err(auth::TokenError::RefreshFailed(e)) => {
            eprintln!("scheduler: token refresh failed, disconnecting: {e}");
            auth::set_disconnected(app);
            send_desktop_notification(
                app,
                "TwitchTrack disconnected from Twitch",
                "Reconnect in Settings to keep tracking your Watchlist.",
            );
            return Err(TickError::NotConnected);
        }
    };

    let db = app.state::<Db>();
    let rows = {
        let conn = db.0.lock().unwrap();
        watchlist::list(&conn).map_err(|e| TickError::Request(e.into()))?
    };
    let ids: Vec<i64> = rows.iter().map(|r| r.user_id).collect();

    let fresh_streams = twitch::get_streams(&http, &token, &ids)
        .await
        .map_err(TickError::Request)?;
    let fresh_by_id: HashMap<i64, &StreamInfo> =
        fresh_streams.iter().map(|s| (s.user_id, s)).collect();

    let toggles = {
        let conn = db.0.lock().unwrap();
        settings::notification_toggles(&conn).map_err(|e| TickError::Request(e.into()))?
    };

    let now = now_unix();
    let mut cache_out: HashMap<i64, LiveEntry> = HashMap::new();
    let mut notified_user_id: Option<i64> = None;

    for row in &rows {
        let track = tracks.entry(row.user_id).or_default();
        let fresh = fresh_by_id.get(&row.user_id).copied();

        match (fresh, track.is_live) {
            (Some(s), false) => {
                // Go-Live. Timestamp the Notification at Twitch's real Stream Session
                // start (s.started_at), not "now" (when we happened to detect it) —
                // otherwise a streamer already live when the app launches (or found
                // after any polling gap) shows a misleading "just went live" time.
                if toggles.go_live && !suppress_notifications {
                    let conn = db.0.lock().unwrap();
                    let _ = notifications::insert_go_live(
                        &conn,
                        &notifications::NewGoLive {
                            user_id: row.user_id,
                            login: &row.login,
                            display_name: &row.display_name,
                            category: &s.category,
                            title: &s.title,
                        },
                        s.started_at,
                    );
                    drop(conn);
                    send_desktop_notification(
                        app,
                        &format!("{} is live", row.display_name),
                        &format!("{} — {}", s.category, s.title),
                    );
                    notified_user_id = Some(row.user_id);
                }
                track.is_live = true;
                track.started_at = s.started_at;
                track.confirmed_title = s.title.clone();
                track.confirmed_category = s.category.clone();
                track.pending = None;
            }
            (None, true) => {
                // Go-Offline
                let duration_seconds = (now - track.started_at).max(0);
                if toggles.go_offline && !suppress_notifications {
                    let conn = db.0.lock().unwrap();
                    let _ = notifications::insert_go_offline(
                        &conn,
                        &notifications::NewGoOffline {
                            user_id: row.user_id,
                            login: &row.login,
                            display_name: &row.display_name,
                            duration_seconds,
                        },
                        now,
                    );
                    drop(conn);
                    send_desktop_notification(
                        app,
                        &format!("{} went offline", row.display_name),
                        &format!("after {}", format_duration(duration_seconds)),
                    );
                    notified_user_id = Some(row.user_id);
                }
                {
                    let conn = db.0.lock().unwrap();
                    let _ = watchlist::set_last_live_at(&conn, row.user_id, now);
                }
                track.is_live = false;
                track.pending = None;
            }
            (Some(s), true) => {
                // Still live — evaluate Metadata Change debounce.
                if s.title == track.confirmed_title && s.category == track.confirmed_category {
                    track.pending = None;
                } else {
                    let matches_pending = track
                        .pending
                        .as_ref()
                        .is_some_and(|p| p.title == s.title && p.category == s.category);

                    if matches_pending {
                        let pending = track.pending.as_ref().unwrap();
                        let stable_for = pending.since.elapsed();
                        // Timestamp the Notification at when the candidate first appeared,
                        // not at confirmation time (2 minutes later) — closer to when the
                        // change actually happened.
                        let changed_at = pending.first_seen_unix;
                        if stable_for >= METADATA_STABILITY_WINDOW {
                            let title_changed = s.title != track.confirmed_title;
                            let category_changed = s.category != track.confirmed_category;
                            if toggles.metadata_change && !suppress_notifications {
                                let conn = db.0.lock().unwrap();
                                let _ = notifications::insert_metadata_change(
                                    &conn,
                                    &notifications::NewMetadataChange {
                                        user_id: row.user_id,
                                        login: &row.login,
                                        display_name: &row.display_name,
                                        old_title: title_changed
                                            .then_some(track.confirmed_title.as_str()),
                                        new_title: title_changed.then_some(s.title.as_str()),
                                        old_category: category_changed
                                            .then_some(track.confirmed_category.as_str()),
                                        new_category: category_changed
                                            .then_some(s.category.as_str()),
                                    },
                                    changed_at,
                                );
                                drop(conn);
                                send_desktop_notification(
                                    app,
                                    &format!("{} updated their stream", row.display_name),
                                    &metadata_change_summary(
                                        title_changed,
                                        &track.confirmed_title,
                                        &s.title,
                                        category_changed,
                                        &track.confirmed_category,
                                        &s.category,
                                    ),
                                );
                                notified_user_id = Some(row.user_id);
                            }
                            track.confirmed_title = s.title.clone();
                            track.confirmed_category = s.category.clone();
                            track.pending = None;
                        }
                    } else {
                        track.pending = Some(PendingMetadata {
                            title: s.title.clone(),
                            category: s.category.clone(),
                            since: Instant::now(),
                            first_seen_unix: now,
                        });
                    }
                }
            }
            (None, false) => { /* still offline, nothing to do */ }
        }

        if let Some(s) = fresh {
            cache_out.insert(
                row.user_id,
                LiveEntry {
                    category: s.category.clone(),
                    title: s.title.clone(),
                    view_count: s.view_count,
                    started_at: s.started_at,
                    thumbnail_url: s.thumbnail_url.clone(),
                },
            );
        }
    }

    // Drop tracking state for streamers no longer on the Watchlist.
    let current_ids: std::collections::HashSet<i64> = rows.iter().map(|r| r.user_id).collect();
    tracks.retain(|id, _| current_ids.contains(id));

    let cache = app.state::<LiveCache>();
    cache.replace(cache_out);

    // Every tick, regardless of any Notification — view counts etc. change even
    // without a Status/Metadata Change, and the Watchlist should reflect that live.
    let _ = app.emit("live-state-updated", ());

    if let Some(user_id) = notified_user_id {
        let _ = app.emit("notification-created", user_id);
    }

    if tick % PRUNE_EVERY_N_TICKS == 0 {
        let conn = db.0.lock().unwrap();
        let _ = notifications::prune_older_than_30_days(&conn, now);
    }

    Ok(())
}

fn metadata_change_summary(
    title_changed: bool,
    old_title: &str,
    new_title: &str,
    category_changed: bool,
    old_category: &str,
    new_category: &str,
) -> String {
    let mut parts = vec![];
    if title_changed {
        parts.push(format!("title: \"{old_title}\" → \"{new_title}\""));
    }
    if category_changed {
        parts.push(format!("category: {old_category} → {new_category}"));
    }
    parts.join(" and ")
}

fn send_desktop_notification(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("failed to send desktop notification: {e}");
    }
}

fn format_duration(seconds: i64) -> String {
    let h = seconds / 3600;
    let m = (seconds % 3600) / 60;
    if h > 0 {
        format!("{h}h {m:02}m")
    } else {
        format!("{m}m")
    }
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
