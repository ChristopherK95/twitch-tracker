import type { NotificationKind } from "./tauri";
import goLiveSound from "../assets/sounds/go-live.wav";
import goOfflineSound from "../assets/sounds/go-offline.wav";
import metadataChangeSound from "../assets/sounds/metadata-change.wav";

const SOUND_BY_KIND: Record<NotificationKind, string> = {
  go_live: goLiveSound,
  go_offline: goOfflineSound,
  metadata_change: metadataChangeSound,
};

// One shared, preloaded Audio element per kind — cloned on play so overlapping
// notifications (two streamers going live in the same tick) don't cut each other off.
const players: Record<NotificationKind, HTMLAudioElement> = {
  go_live: new Audio(SOUND_BY_KIND.go_live),
  go_offline: new Audio(SOUND_BY_KIND.go_offline),
  metadata_change: new Audio(SOUND_BY_KIND.metadata_change),
};

export function playNotificationSound(kind: NotificationKind) {
  const clone = players[kind].cloneNode(true) as HTMLAudioElement;
  clone.volume = 0.5;
  // Autoplay-policy rejections (e.g. no user gesture yet) are fine to swallow —
  // a missed chime isn't worth surfacing as an error.
  clone.play().catch(() => {});
}
