# Prototype the main Watchlist / live-streamer display

Type: prototype
Status: resolved
Blocked by: (none)

## Question

Prototype the app's main view: the Watchlist, ordered live-status-first, showing for each live Watched Streamer their view count, category, title, Stream Session elapsed time and start time, and a stream preview (static thumbnail, per the map's standing decision). Offline Watched Streamers need some representation too (how minimal?).

Cover: layout (list vs. grid of cards), how the thumbnail preview is triggered/displayed (always visible vs. on hover/click), what happens on interacting with a live streamer's entry (e.g. opens their Twitch channel in the browser), and how search-as-you-type + adding a new Watched Streamer fits into this same view versus a separate one.

**Settled by [SQLite schema](02-sqlite-schema.md) — design against this, don't reopen it:** live streamers rank `click_count DESC, view_count DESC`; offline streamers rank below all live ones by `last_live_at DESC` (never-live last, and should show "last live: <date>" or similar since offline entries need *some* representation of that). A streamer's name is clickable, opens the stream in the OS default browser, and increments `click_count`.

## Answer

Prototyped three structurally different layouts (list, card grid, master-detail rail) as a live-switchable artifact: [Watchlist Layouts prototype](https://claude.ai/code/artifact/5331021d-b487-4ec2-b0f1-9b7e883f3973) (primary source — no repo/branch exists yet to fold this into, so the artifact link is the record).

**Chosen: "Signal Feed"** — a single dense vertical list, no grid.
- **Layout**: one column. "Live now" section first, each row: a wide thumbnail (128×72) on the left, then name (clickable) + category pill, title, and elapsed time + start time in tabular digits below.
- **Thumbnail display**: always visible inline in the row (not hover/click-triggered) — the viewer count is overlaid on the thumbnail itself, Twitch-style.
- **Offline representation**: a second "Offline" section below, compact single-line rows — small avatar, name, "last live &lt;X&gt; ago" (or "not yet live" per the schema's null case), no thumbnail (nothing to preview).
- **Interaction**: clicking a streamer's name opens their stream in the OS default browser (per the schema decision) — the row itself isn't a giant click target, just the name.
- **Search-to-add**: same view, not separate. A search input pinned at the top of the list; typing shows an inline dropdown of results directly beneath it, no modal/route change.

## Asset

[Watchlist Layouts prototype (Artifact)](https://claude.ai/code/artifact/5331021d-b487-4ec2-b0f1-9b7e883f3973)

