import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { commands, openInBrowser, type AuthStatus, type NotificationKind, type SettingsRow } from "../../lib/tauri";
import { PanelBottomIcon, PlugIcon, UnplugIcon, UserRoundIcon } from "../../components/icons";
import { DEV_KEYBINDS } from "../../lib/devKeybinds";
import "./Settings.css";

type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; downloaded: number; total: number | null }
  | { kind: "error"; message: string };

interface SettingsProps {
  authStatus: AuthStatus;
}

export function Settings({ authStatus }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: "idle" });

  useEffect(() => {
    commands.getSettings().then(setSettings);
  }, [authStatus]);

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  async function handleCheckForUpdate() {
    setUpdateStatus({ kind: "checking" });
    try {
      const update = await checkForUpdate();
      setUpdateStatus(update ? { kind: "available", update } : { kind: "up-to-date" });
    } catch (e) {
      setUpdateStatus({ kind: "error", message: String(e) });
    }
  }

  async function installUpdate(update: Update) {
    setUpdateStatus({ kind: "installing", downloaded: 0, total: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setUpdateStatus({ kind: "installing", downloaded: 0, total: event.data.contentLength ?? null });
        } else if (event.event === "Progress") {
          setUpdateStatus((s) =>
            s.kind === "installing"
              ? { kind: "installing", downloaded: s.downloaded + event.data.chunkLength, total: s.total }
              : s,
          );
        }
      });
      await relaunch();
    } catch (e) {
      setUpdateStatus({ kind: "error", message: String(e) });
    }
  }

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

        <div className="dash-card">
          <div className="card-title-row">
            <h2 className="card-title">About</h2>
            <span className="rule" />
          </div>
          <div className="field-row">
            <div>
              <div className="field-label">TwitchTrack{appVersion ? ` v${appVersion}` : ""}</div>
              <div className="field-desc">
                {updateStatus.kind === "idle" && "Check GitHub for a newer release."}
                {updateStatus.kind === "checking" && "Checking for updates…"}
                {updateStatus.kind === "up-to-date" && "You're on the latest version."}
                {updateStatus.kind === "available" &&
                  `Version ${updateStatus.update.version} is available.`}
                {updateStatus.kind === "installing" &&
                  (updateStatus.total
                    ? `Downloading update… ${Math.round((updateStatus.downloaded / updateStatus.total) * 100)}%`
                    : "Downloading update…")}
                {updateStatus.kind === "error" && (
                  <span style={{ color: "var(--warn)" }}>{updateStatus.message}</span>
                )}
              </div>
            </div>
            {(updateStatus.kind === "idle" ||
              updateStatus.kind === "checking" ||
              updateStatus.kind === "up-to-date" ||
              updateStatus.kind === "error") && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleCheckForUpdate}
                disabled={updateStatus.kind === "checking"}
              >
                {updateStatus.kind === "checking" ? "Checking…" : "Check for Updates"}
              </button>
            )}
            {updateStatus.kind === "available" && (
              <button className="btn btn-primary btn-sm" onClick={() => installUpdate(updateStatus.update)}>
                Install
              </button>
            )}
          </div>
          {updateStatus.kind === "installing" && (
            <div className="update-progress">
              <div
                className="update-progress-bar"
                style={{
                  width: updateStatus.total
                    ? `${Math.min(100, (updateStatus.downloaded / updateStatus.total) * 100)}%`
                    : "35%",
                }}
              />
            </div>
          )}
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
