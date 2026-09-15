# TwitchTrack — Design Recreation Prompt (for pen.dev)

Recreate the UI of a desktop app called **TwitchTrack** — a Twitch streamer watchlist and
notification tool. It's a single-window desktop app (Tauri, ~900x640 default size, but the
layout should be fluid/full-width, not centered with a max-width). Build every page/state
below as its own frame/screen. Dark mode is the primary design target; a light variant
exists but is secondary.

## Visual identity — "Stream Violet"

**Dark theme (primary):**
- Background: `#14121b`
- Surface (cards/panels): `#1d1a29`
- Surface 2 (nested/hover surfaces): `#262238`
- Surface 3 (subtle fills, e.g. skeleton/placeholder blocks): `#322c47`
- Text high (primary text): `#f1eefa`
- Text muted (secondary text): `#9b92b8`
- Text faint (tertiary/disabled text): `#6f6790`
- Accent (brand violet, buttons/links/highlights): `#8b7cff`
- Accent-ink (text/icon color placed ON an accent-filled surface): `#14121b`
- Live/success green (go-live indicators, active status dot): `#33d17a`
- Live-ink (text on green fill): `#0b2015`
- Warn/amber (errors, disconnected state): `#f0a94e`
- Warn background (subtle warning fill): `#3a2a12`
- Border: `#322c47`
- Shadow: soft, two-layer — `0 1px 2px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.4)`

**Light theme (secondary, same structure):**
- Background `#faf9fc`, Surface `#ffffff`, Surface 2 `#f1eef7`, Surface 3 `#e7e2f3`
- Text high `#1d1a29`, muted `#6f6790`, faint `#9b92b8`
- Accent `#6a4fe0` (accent-ink `#ffffff`)
- Live `#1e9e5a` (live-ink `#ffffff`), Warn `#b5620a` (warn-bg `#fcebd8`)
- Border `#e3dfee`

**Typography:**
- Display font (headings, wordmark, big numbers): **Sora**, weights 600/700
- Body font (UI text, labels, descriptions): **IBM Plex Sans**, weights 400/500/600
- Monospace font (the Twitch device-activation code): **IBM Plex Mono**, weight 400/500

**App icon / mark:** a violet gradient "eye" — an almond/lens shape (gradient `#8b7cff` top
to `#6a4fe0` bottom) with a dark pupil, a subtle darker eyelid-crease arc along the top inner
edge, and a small light catchlight highlight dot on the pupil (upper-left). Sits on a
rounded-square dark (`#14121b`) tile. Use this as the wordmark's small accent dot / app icon
throughout.

## Global chrome

Every authenticated screen shares a **top bar**:
- Left: wordmark — a small violet dot/icon + "TwitchTrack" in the display font, bold.
- Center/right: a horizontal nav with three text buttons — **Watchlist**, **Notifications**,
  **Settings** — the active one styled with the accent color and a subtle underline or
  pill background; inactive ones in muted text.
- Far right: a **poll countdown timer** — a small circular progress ring (SVG, accent-colored
  stroke that depletes over ~20 seconds) surrounding a tiny hourglass icon. When the countdown
  completes, the hourglass does a flip/rotate animation before the ring resets.

If the Twitch account is currently disconnected, a **persistent banner** appears directly
below the top bar, full-width, warm/amber-tinted background (`--warn-bg`), with text like
"Twitch account disconnected — reconnect in Settings" and a small warning-colored icon.

## Screen 1 — Watchlist ("Signal Feed")

The main/default view. Full-width, left-aligned content (not centered), generous vertical
rhythm between sections.

- **Search row** at the top: a single full-width text input, placeholder "Search for a
  streamer to track…" (or, when disconnected, a disabled input reading "Connect your Twitch
  account to search"). Typing shows a dropdown/panel of search results directly below the
  input — each result row has a small circular avatar (real image if available, otherwise a
  colored circle with the streamer's initials) and their display name; clicking adds them to
  the watchlist.

- **"Live now — N" section heading** (bold, display font), followed by one **row per live
  streamer**. Each live row is a horizontal card:
  - Left: a 16:9 stream thumbnail (rounded corners), with a small pill-shaped "viewer count"
    chip overlaid in the corner (e.g. "1,204").
  - Right of the thumbnail: a small circular avatar next to the streamer's display name
    rendered as a clickable link-styled button (opens their stream in the browser on click),
    followed by a category pill badge (rounded, subtle surface-2 background, small text).
  - Below that: the stream title as a single line of muted-but-readable text.
  - Below that: small faint stats text, e.g. "1h 24m elapsed".
  - Live rows have a subtle "this just happened" highlight capability — a soft accent-tinted
    left border or background wash that can flash briefly (used when a fresh notification
    fires for that streamer).

- **"Offline — N" section heading**, followed by one **row per offline streamer**, simpler:
  circular avatar, clickable display-name link, and small faint text like "last live 2 days
  ago" / "last live yesterday" / "last live today" / "not yet live" (for streamers never seen
  live).

Rows should feel like a clean list/feed — no heavy card borders, mostly separated by spacing
and a hairline border color, background matching the page (not boxed cards).

## Screen 2 — Notifications ("Grouped by Streamer")

- **Toolbar** at the top: a row of filter chips — "All" (default active), "Go-Live",
  "Go-Offline", "Metadata Change" — pill-shaped buttons, active one filled with the accent
  color, inactive ones outlined/subtle. A "Clear log" chip sits at the end of this row (only
  visible when there's at least one notification), styled with a slight warning/destructive
  tint.

- **Grouped entries**: notifications are grouped by streamer, each group is a collapsible
  section:
  - **Group header** (clickable to expand/collapse): a circular avatar (colored by streamer,
    initials), the streamer's display name (bold), a count badge like "5 notifications", and
    a small chevron (▾) that rotates when collapsed.
  - **Group body** (list of entries, shown when expanded): each entry has a small round icon
    on the left indicating event type — a filled dot (●) for Go-Live in green, a hollow ring
    (○) for Go-Offline in muted/faint color, a pencil mark (✎) for Metadata Change in accent
    violet — followed by a line of text describing the event (e.g. "is live — Just Chatting:
    some title", "went offline after 2h 15m", "changed their title — "old" → "new""), and a
    smaller timestamp line below it (e.g. "Sep 12, 3:45 PM").

- **Empty state**: centered muted text, "No notifications yet — they'll show up here once a
  Watched Streamer goes live, offline, or changes their title/category."

- **Footer note** (when there are entries): small centered faint text, "— notifications older
  than 30 days are pruned automatically —".

- **Clear-log confirmation dialog**: a themed modal overlay (dark scrim behind, a centered
  card in `--surface` with border and shadow) — NOT a native browser confirm(). Title "Clear
  Notification Log?", body text "This permanently deletes every notification currently in the
  log. This can't be undone.", a destructive-styled (red/warn) primary "Clear log" button and
  a plain "Cancel" button.

## Screen 3 — Settings ("Card Dashboard")

A dashboard-style grid of independent cards (not a single tall form):

- **Account card** (wider — spans two grid columns): heading "Account".
  - Connected state: a circular profile picture (the real connected Twitch account's avatar,
    fetched from Twitch — falls back to initials-in-a-colored-circle if unavailable), next to
    "Connected as {twitch_login}" and a small live-green status dot + "Active" text below it,
    with a "Disconnect" outlined button on the far right.
  - Connecting state: "Connecting…" label, a line of text "Go to [clickable link to Twitch's
    device-activation URL] and confirm this code:", a bold monospace **code box** displaying
    the device code, and "Waiting for approval…" muted text.
  - Disconnected state: a placeholder "?" avatar in a muted circle, "Not connected" heading,
    descriptive text, and a primary accent-filled "Connect your Twitch account" button.

- **Notifications card**: heading "Notifications", three toggle rows, each with a bold label
  and a muted description line, and a pill/switch-style toggle on the right:
  - "Go-Live" — "Notify when a Watched Streamer starts a Stream Session"
  - "Go-Offline" — "Notify when a Watched Streamer's Stream Session ends"
  - "Metadata Change" — "Notify when a live streamer's title or category changes"

- **Startup card**: heading "Startup", one toggle row "Start on login" — "Launch TwitchTrack
  automatically when you log in" — plus a small muted note below explaining that closing the
  window keeps the app running in the system tray, and the tray menu is used to actually quit.

## Screen 4 — Onboarding (first-run only, no top nav yet — just the wordmark bar)

Both onboarding steps are centered single-column cards on an otherwise empty page.

- **Step 1 — Connect**: heading "Welcome to TwitchTrack", subtitle "Connect your Twitch
  account so TwitchTrack can check on the streamers you want to keep an eye on.", then either
  a primary "Connect your Twitch account" button, or (once a connect attempt is in progress)
  the same "go to this clickable link and confirm this code" + monospace code box + "Waiting
  for approval…" pattern as the Settings connecting state.

- **Step 2 — Add first streamer** (shown right after connecting, only while the watchlist is
  still empty): heading "Track your first streamer", subtitle "Search for a Twitch channel to
  start watching for when they go live.", a search input with the same live dropdown-of-
  results pattern as the Watchlist screen, and a plain text-link-styled "Skip for now" button
  below the input.

## Design notes / constraints

- Keep corner radii soft but not overly rounded — small-to-medium radius on cards/buttons/
  inputs (think 8–12px), fully round on avatars, pills, and toggle switches.
- Avoid centering the whole app in a fixed max-width column — the Watchlist/Notifications/
  Settings content should stretch to fill the window width with consistent side padding.
- This is a dark-first, focused utility app — not flashy. Favor generous whitespace, a single
  accent color used sparingly (buttons, active states, the live-status dot, links), and let
  muted/faint text tones carry secondary information instead of extra borders or dividers.
