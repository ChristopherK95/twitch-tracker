import { useEffect, useState } from "react";
import { commands, openInBrowser, type AuthStatus, type NotificationKind, type SettingsRow } from "../../lib/tauri";
import { PanelBottomIcon, PlugIcon, UnplugIcon, UserRoundIcon } from "../../components/icons";
import { DEV_KEYBINDS } from "../../lib/devKeybinds";
import "./Settings.css";

interface SettingsProps {
  authStatus: AuthStatus;
}

export function Settings({ authStatus }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    commands.getSettings().then(setSettings);
  }, [authStatus]);

  async function connect() {
    setConnectBusy(true);
    setConnectError(null);
    try {
      await commands.startConnectFlow();
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setConnectBusy(false);
    }
  }

  async function toggleNotification(kind: NotificationKind, enabled: boolean) {
    if (!settings) return;
    await commands.setNotificationToggle(kind, enabled);
    setSettings({ ...settings, [`notify_${kind}`]: enabled } as SettingsRow);
  }

  async function toggleStartOnLogin(enabled: boolean) {
    await commands.setStartOnLogin(enabled);
    setSettings((s) => (s ? { ...s, start_on_login: enabled } : s));
  }

  return (
    <div className="settings">
      <div className="dash-grid">
        <div className="dash-card span-2">
          <div className="card-title-row">
            <h2 className="card-title">Account</h2>
            <span className="rule" />
          </div>
          {authStatus.status === "connected" && (
            <div className="account-row">
              {settings?.twitch_profile_image_url ? (
                <img className="avatar avatar--img" src={settings.twitch_profile_image_url} alt="" />
              ) : (
                <div className="avatar">{authStatus.login.slice(0, 2).toUpperCase()}</div>
              )}
              <div className="account-info">
                <div className="name-row">
                  <div className="field-label">{authStatus.login}</div>
                  <div className="status-tag">
                    <span className="status-dot" />
                    ACTIVE
                  </div>
                </div>
                <div className="field-desc">connected via Twitch device authorization</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => commands.disconnect()}>
                <UnplugIcon size={14} />
                Disconnect
              </button>
            </div>
          )}
          {authStatus.status === "connecting" && (
            <>
              <div className="field-label">Connecting…</div>
              <div className="field-desc">
                Go to{" "}
                <button className="link-btn" onClick={() => openInBrowser(authStatus.verification_uri)}>
                  {authStatus.verification_uri}
                </button>{" "}
                and confirm this code:
              </div>
              <div className="code-box">{authStatus.user_code}</div>
              <div className="field-desc">Waiting for approval…</div>
            </>
          )}
          {authStatus.status === "disconnected" && (
            <>
              <div className="account-row">
                <div className="avatar avatar--empty">
                  <UserRoundIcon size={22} />
                </div>
                <div className="account-info">
                  <div className="field-label">Not connected</div>
                  <div className="field-desc">
                    TwitchTrack needs a Twitch account to look up streamers and check who is live.
                  </div>
                </div>
                <button className="btn btn-primary" onClick={connect} disabled={connectBusy}>
                  <PlugIcon size={15} />
                  Connect your Twitch account
                </button>
              </div>
              {connectError && <div className="field-desc" style={{ color: "var(--warn)" }}>{connectError}</div>}
            </>
          )}
        </div>

        <div className="dash-card">
          <div className="card-title-row">
            <h2 className="card-title">Notifications</h2>
            <span className="rule" />
          </div>
          {settings && (
            <>
              <ToggleRow
                label="Go-Live"
                desc="Notify when a Watched Streamer starts a Stream Session"
                checked={settings.notify_go_live}
                onChange={(v) => toggleNotification("go_live", v)}
              />
              <ToggleRow
                label="Go-Offline"
                desc="Notify when a Watched Streamer's Stream Session ends"
                checked={settings.notify_go_offline}
                onChange={(v) => toggleNotification("go_offline", v)}
              />
              <ToggleRow
                label="Metadata Change"
                desc="Notify when a live streamer's title or category changes"
                checked={settings.notify_metadata_change}
                onChange={(v) => toggleNotification("metadata_change", v)}
              />
            </>
          )}
        </div>

        <div className="dash-card">
          <div className="card-title-row">
            <h2 className="card-title">Startup</h2>
            <span className="rule" />
          </div>
          {settings && (
            <ToggleRow
              label="Start on login"
              desc="Launch TwitchTrack automatically when you log in"
              checked={settings.start_on_login}
              onChange={toggleStartOnLogin}
            />
          )}
          <div className="tray-note">
            <PanelBottomIcon size={14} />
            <span>
              Closing the window keeps TwitchTrack running in the system tray — use the tray menu to quit
              it for good.
            </span>
          </div>
        </div>

        {import.meta.env.DEV && (
          <div className="dash-card span-2">
            <div className="card-title-row">
              <h2 className="card-title">Developer</h2>
              <span className="rule" />
            </div>
            <div className="field-desc">Only present in dev builds — these don't exist in a packaged release.</div>
            {DEV_KEYBINDS.map((kb) => (
              <div className="keybind-row" key={kb.keys}>
                <kbd className="keybind-key">{kb.keys}</kbd>
                <div className="field-desc">{kb.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="field-row">
      <div>
        <div className="field-label">{label}</div>
        <div className="field-desc">{desc}</div>
      </div>
      <button className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} />
    </div>
  );
}
