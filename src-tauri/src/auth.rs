//! Token storage (OS keychain via the `keyring` crate — no separate Tauri plugin needed,
//! this never needs a frontend API surface) and the in-memory connection state machine.
//! See .scratch/twitchtrack-v1-spec/map.md's Auth standing decision and issues/03.

use serde::{Deserialize, Serialize};

const SERVICE: &str = "twitchtrack";
const USERNAME: &str = "oauth-token";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredToken {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64, // unix epoch seconds
}

impl StoredToken {
    pub fn from_token_response(t: crate::twitch::TokenResponse) -> Self {
        Self {
            access_token: t.access_token,
            refresh_token: t.refresh_token,
            expires_at: now_unix() + t.expires_in,
        }
    }

    /// Proactive refresh threshold per the polling scheduler ticket: under ~30 min left.
    pub fn needs_refresh(&self) -> bool {
        self.expires_at - now_unix() < 30 * 60
    }
}

pub fn load() -> Option<StoredToken> {
    let entry = match keyring::Entry::new(SERVICE, USERNAME) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("keyring: failed to construct entry: {e}");
            return None;
        }
    };
    let json = match entry.get_password() {
        Ok(j) => j,
        Err(e) => {
            eprintln!("keyring: failed to read stored token: {e}");
            return None;
        }
    };
    match serde_json::from_str(&json) {
        Ok(t) => Some(t),
        Err(e) => {
            eprintln!("keyring: stored token JSON was unparseable: {e}");
            None
        }
    }
}

pub fn save(token: &StoredToken) -> anyhow::Result<()> {
    let entry = keyring::Entry::new(SERVICE, USERNAME)?;
    entry.set_password(&serde_json::to_string(token)?)?;
    Ok(())
}

pub fn clear() -> anyhow::Result<()> {
    let entry = keyring::Entry::new(SERVICE, USERNAME)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AuthStatus {
    Disconnected,
    Connecting {
        user_code: String,
        verification_uri: String,
    },
    Connected {
        login: String,
        user_id: i64,
    },
}

pub struct AuthState(pub std::sync::Mutex<AuthStatus>);

impl AuthState {
    pub fn initial() -> Self {
        let status = match load() {
            Some(_) => AuthStatus::Disconnected, // resolved to Connected during app setup once we validate/refresh
            None => AuthStatus::Disconnected,
        };
        Self(std::sync::Mutex::new(status))
    }
}

/// Distinguishes "nothing has ever been connected" (routine, no user action needed) from
/// "a token existed but refreshing it just failed" (the one case ticket 04 says should
/// actually surface to the user — tray badge, one desktop notification, in-app banner).
#[derive(Debug)]
pub enum TokenError {
    NeverConnected,
    RefreshFailed(anyhow::Error),
}

impl std::fmt::Display for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TokenError::NeverConnected => write!(f, "not connected"),
            TokenError::RefreshFailed(e) => write!(f, "token refresh failed: {e}"),
        }
    }
}
impl std::error::Error for TokenError {}

/// Returns a currently-valid access token, refreshing (and re-persisting) it first if
/// it's within the proactive-refresh window.
pub async fn get_valid_access_token(http: &reqwest::Client) -> Result<String, TokenError> {
    let mut token = load().ok_or(TokenError::NeverConnected)?;
    if token.needs_refresh() {
        let refreshed = crate::twitch::refresh_token(http, &token.refresh_token)
            .await
            .map_err(TokenError::RefreshFailed)?;
        token = StoredToken::from_token_response(refreshed);
        save(&token).map_err(TokenError::RefreshFailed)?;
    }
    Ok(token.access_token)
}

/// Shared disconnect transition — used both by the user clicking "Disconnect" and by
/// the scheduler detecting a genuine refresh failure. Always clears the token, flips
/// AuthState, emits the event, and updates the tray's disconnected indicator; the one
/// desktop notification for the *unexpected* case is sent by the caller, not here.
pub fn set_disconnected(app: &tauri::AppHandle) {
    use tauri::Manager;
    let _ = clear();
    let status = AuthStatus::Disconnected;
    if let Some(state) = app.try_state::<AuthState>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = status.clone();
        }
    }
    let _ = tauri::Emitter::emit(app, "auth-status-changed", &status);
    crate::tray::set_disconnected_indicator(app, true);
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
