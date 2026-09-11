# Prototype the Notification Log page and notification content

Type: prototype
Status: resolved
Blocked by: 02

## Question

Using the Notification Log's schema (from the SQLite schema ticket), prototype:

- The Notification Log page: layout, what's shown per entry (Watched Streamer, event type, timestamp, and event-specific detail — e.g. old/new title or category for a Metadata Change), filtering/sorting if any, and how the 30-day retention cap is communicated (if at all) versus silent.
- Notification content/copy: what a Go-Live, Go-Offline, and Metadata Change Notification actually says, both as a desktop notification and as an in-app entry (they may need different lengths/formats).

## Answer

**Preceded by a schema amendment** (see [SQLite schema](02-sqlite-schema.md)): `notifications` now carries a go_live category/title snapshot and a go_offline `duration_seconds`, decided while scoping this ticket — without them the Log would be names and timestamps with no content.

**Notification copy** (final, English-only, no localization):
- Go-Live: "**&lt;name&gt;** is live — &lt;category&gt;: &lt;title&gt;"
- Go-Offline: "**&lt;name&gt;** went offline after &lt;duration&gt;" (e.g. "2h 17m")
- Metadata Change: "**&lt;name&gt;** changed their title — "&lt;old&gt;" → "&lt;new&gt;"" and/or "changed category — &lt;old&gt; → &lt;new&gt;" (joined with "and" if both changed at once)

Prototyped three layouts as a live-switchable artifact: [Notification Log prototype](https://claude.ai/code/artifact/eea041f3-77ee-4587-9271-ddf52b13702c) (primary source).

**Chosen: "Grouped by Streamer"** — collapsible sections per Watched Streamer (avatar, name, notification count), each expanding to that streamer's own notifications in reverse-chronological order. Groups sort by notification count (busiest streamer first). Filter chips (All / Go-Live / Go-Offline / Metadata Change) stay available above the groups. **Retention communicated via a footer note**: "— notifications older than 30 days are pruned automatically —" at the bottom of the page.

