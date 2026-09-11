# Decide TwitchTrack's visual identity

Type: prototype
Status: resolved
Blocked by: (none)

## Question

Every prototype so far ([Watchlist](05-watchlist-display-prototype.md), [Settings](06-settings-lifecycle-prototype.md), [Notification Log](07-notification-log-prototype.md)) used the same placeholder dark-violet palette (Sora / IBM Plex Sans / IBM Plex Mono) purely for internal consistency across mockups — it was never a considered branding decision.

Decide TwitchTrack's actual visual identity for v1: a real color palette (light and dark mode both, since the app should respect the OS theme rather than force one), typography, and any iconography/app-icon direction. This should either validate the placeholder palette as the real answer or replace it — and the choice should be applied back across the three already-resolved UI prototypes' decisions (i.e., re-skin, not re-litigate their layout/structure choices).

## Answer

Prototyped three real, distinct identity directions applied to the already-chosen Signal Feed layout (not swatches in a vacuum): [Visual Identity prototype](https://claude.ai/code/artifact/17027c27-b065-496c-91e0-74913289e91f) (primary source).

**Chosen: "Stream Violet"** — the placeholder palette used throughout charting is validated as the real answer, not just a mockup convenience.

- **Color**: bg `#15121C`, surface `#1E1A2B`/`#272238`, text `#F2EEFA`/`#9A90BB`, accent `#8B5CF6` (violet), semantic live-indicator `#34D399` (green, kept separate from the accent hue).
- **Type**: display/headings — Sora (600/700). Body — IBM Plex Sans. Tabular data (viewer counts, elapsed time, timestamps) — IBM Plex Mono.
- Dark-first; a light-mode palette still needs deriving from these tokens before implementation (straightforward token-swap, not a design decision — no separate ticket needed).

This retroactively validates the identity already used in the [Watchlist](05-watchlist-display-prototype.md), [Settings](06-settings-lifecycle-prototype.md), and [Notification Log](07-notification-log-prototype.md) prototypes — no re-skinning needed, their mockups already are the answer.

