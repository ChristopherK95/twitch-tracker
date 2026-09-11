//! Twitch Helix + OAuth Device Code Grant client.
//! Source of record: .scratch/twitchtrack-v1-spec/issues/01-tauri-capabilities-research.md
//! and issues/03-polling-scheduler.md (auth), and the earlier chat research on token
//! lifecycle (Device Code Grant, public client, no client_secret ever).

use serde::{Deserialize, Serialize};

/// Registered once by the developer at dev.twitch.tv/console/apps (Client Type: Public).
/// Not sensitive — a Client ID is meant to ship inside distributed OAuth "public" clients;
/// only a Client Secret would need to stay off the wire, and this flow has none.
pub const CLIENT_ID: &str = "t70pjbca3xzntccay6lhqdtolp6mi4";

const AUTH_BASE: &str = "https://id.twitch.tv/oauth2";
const HELIX_BASE: &str = "https://api.twitch.tv/helix";

#[derive(Debug, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: i64,
    pub interval: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
}

#[derive(Debug, Deserialize)]
struct TokenErrorResponse {
    message: String,
}

pub enum PollOutcome {
    Pending,
    Success(TokenResponse),
    Expired,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamInfo {
    pub user_id: i64,
    pub category: String,
    pub title: String,
    pub view_count: i64,
    pub started_at: i64, // unix epoch seconds
}

#[derive(Debug, Clone, Serialize)]
pub struct ChannelSearchResult {
    pub user_id: i64,
    pub login: String,
    pub display_name: String,
    pub thumbnail_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TwitchUser {
    pub user_id: i64,
    pub login: String,
}

pub async fn request_device_code(http: &reqwest::Client) -> anyhow::Result<DeviceCodeResponse> {
    let resp = http
        .post(format!("{AUTH_BASE}/device"))
        .form(&[("client_id", CLIENT_ID), ("scopes", "")])
        .send()
        .await?
        .error_for_status()?
        .json::<DeviceCodeResponse>()
        .await?;
    Ok(resp)
}

/// One poll attempt against the token endpoint. Caller loops on `Pending` using the
/// device code response's `interval` as the delay between attempts.
pub async fn poll_device_token(
    http: &reqwest::Client,
    device_code: &str,
) -> anyhow::Result<PollOutcome> {
    let resp = http
        .post(format!("{AUTH_BASE}/token"))
        .form(&[
            ("client_id", CLIENT_ID),
            ("scopes", ""),
            ("device_code", device_code),
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:device_code",
            ),
        ])
        .send()
        .await?;

    if resp.status().is_success() {
        let token = resp.json::<TokenResponse>().await?;
        return Ok(PollOutcome::Success(token));
    }

    let status = resp.status();
    let body = resp.json::<TokenErrorResponse>().await.ok();
    let message = body.map(|b| b.message).unwrap_or_default();
    if message.contains("authorization_pending") || message.contains("pending") {
        Ok(PollOutcome::Pending)
    } else if status.as_u16() == 400 && message.contains("expired") {
        Ok(PollOutcome::Expired)
    } else {
        anyhow::bail!("device token poll failed ({status}): {message}")
    }
}

pub async fn refresh_token(
    http: &reqwest::Client,
    refresh_token: &str,
) -> anyhow::Result<TokenResponse> {
    let resp = http
        .post(format!("{AUTH_BASE}/token"))
        .form(&[
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await?
        .error_for_status()?
        .json::<TokenResponse>()
        .await?;
    Ok(resp)
}

/// The connected user's own identity (Get Users with no `id`/`login` params returns the caller).
pub async fn get_self(http: &reqwest::Client, access_token: &str) -> anyhow::Result<TwitchUser> {
    #[derive(Deserialize)]
    struct Data {
        data: Vec<UserRow>,
    }
    #[derive(Deserialize)]
    struct UserRow {
        id: String,
        login: String,
    }

    let resp: Data = helix_get(http, access_token, &format!("{HELIX_BASE}/users")).await?;
    let row = resp
        .data
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("Get Users returned no data for the caller"))?;
    Ok(TwitchUser {
        user_id: row.id.parse()?,
        login: row.login,
    })
}

/// Batched per the settled polling design: up to 100 IDs per call.
pub async fn get_streams(
    http: &reqwest::Client,
    access_token: &str,
    user_ids: &[i64],
) -> anyhow::Result<Vec<StreamInfo>> {
    if user_ids.is_empty() {
        return Ok(vec![]);
    }
    #[derive(Deserialize)]
    struct Data {
        data: Vec<StreamRow>,
    }
    #[derive(Deserialize)]
    struct StreamRow {
        user_id: String,
        game_name: String,
        title: String,
        viewer_count: i64,
        started_at: String, // RFC3339
    }

    let id_params: Vec<(&str, String)> = user_ids
        .iter()
        .take(100)
        .map(|id| ("user_id", id.to_string()))
        .collect();
    let url = format!("{HELIX_BASE}/streams");
    let resp: Data = helix_get_with_query(http, access_token, &url, &id_params).await?;

    Ok(resp
        .data
        .into_iter()
        .filter_map(|r| {
            Some(StreamInfo {
                user_id: r.user_id.parse().ok()?,
                category: r.game_name,
                title: r.title,
                view_count: r.viewer_count,
                started_at: chrono_parse_rfc3339(&r.started_at)?,
            })
        })
        .collect())
}

pub async fn search_channels(
    http: &reqwest::Client,
    access_token: &str,
    query: &str,
) -> anyhow::Result<Vec<ChannelSearchResult>> {
    #[derive(Deserialize)]
    struct Data {
        data: Vec<ChannelRow>,
    }
    #[derive(Deserialize)]
    struct ChannelRow {
        id: String,
        broadcaster_login: String,
        display_name: String,
        thumbnail_url: String,
    }

    let url = format!("{HELIX_BASE}/search/channels");
    let resp: Data =
        helix_get_with_query(http, access_token, &url, &[("query", query.to_string())]).await?;

    Ok(resp
        .data
        .into_iter()
        .filter_map(|r| {
            Some(ChannelSearchResult {
                user_id: r.id.parse().ok()?,
                login: r.broadcaster_login,
                display_name: r.display_name,
                thumbnail_url: r.thumbnail_url,
            })
        })
        .collect())
}

async fn helix_get<T: for<'de> Deserialize<'de>>(
    http: &reqwest::Client,
    access_token: &str,
    url: &str,
) -> anyhow::Result<T> {
    helix_get_with_query(http, access_token, url, &[]).await
}

async fn helix_get_with_query<T: for<'de> Deserialize<'de>>(
    http: &reqwest::Client,
    access_token: &str,
    url: &str,
    query: &[(&str, String)],
) -> anyhow::Result<T> {
    let resp = http
        .get(url)
        .bearer_auth(access_token)
        .header("Client-Id", CLIENT_ID)
        .query(query)
        .send()
        .await?
        .error_for_status()?
        .json::<T>()
        .await?;
    Ok(resp)
}

/// Minimal RFC3339 -> unix seconds parser (avoids pulling in a full datetime crate for
/// one field). Twitch always returns UTC with a `Z` suffix, e.g. `2024-01-02T03:04:05Z`.
fn chrono_parse_rfc3339(s: &str) -> Option<i64> {
    let s = s.trim_end_matches('Z');
    let (date, time) = s.split_once('T')?;
    let mut d = date.split('-');
    let (y, mo, da): (i64, i64, i64) = (
        d.next()?.parse().ok()?,
        d.next()?.parse().ok()?,
        d.next()?.parse().ok()?,
    );
    let mut t = time.split(':');
    let (h, mi, se): (i64, i64, f64) = (
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
    );
    // Days since epoch via a straightforward civil-calendar algorithm (Howard Hinnant's).
    let y2 = if mo <= 2 { y - 1 } else { y };
    let era = if y2 >= 0 { y2 } else { y2 - 399 } / 400;
    let yoe = (y2 - era * 400) as i64;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + da - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some(days * 86400 + h * 3600 + mi * 60 + se as i64)
}
