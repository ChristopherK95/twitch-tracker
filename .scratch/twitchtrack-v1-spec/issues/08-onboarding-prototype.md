# Design the first-run onboarding flow

Type: prototype
Status: resolved
Blocked by: 06

## Question

Using the Settings/Connect-account flow from the Settings prototype ticket, design what a brand-new install shows before Twitch is connected and before any Watched Streamers are added: does it walk the user straight into "Connect your Twitch account," then straight into "search and add your first Watched Streamer," or land on an empty Watchlist view with prompts? Decide the minimum viable first-run path so a new user (i.e., your brother, setting this up for the first time) isn't dropped on a confusing empty screen.

## Answer

Resolved via a short round of questions rather than a new prototype artifact — the screens involved were already designed in [Settings/lifecycle](06-settings-lifecycle-prototype.md) (Account connect flow) and [Watchlist display](05-watchlist-display-prototype.md) (search-as-you-type bar); this ticket only needed to sequence them.

**First-run path**:
1. **Launch → straight into Connect.** No empty Watchlist shown first — the app is non-functional without a Twitch connection, so it opens directly on the Account card's not-connected state (the "Connect your Twitch account" button from the Settings prototype).
2. **After connecting → a dedicated "add your first streamer" screen.** Not a drop onto the empty Signal Feed — a distinct intermediate screen with the same search-as-you-type input, blocking progress to the real Watchlist view until at least one Watched Streamer is added. Includes a **"Skip for now"** link so the flow never hard-traps someone who wants out (e.g. to check Settings first); skipping drops them on the empty Watchlist view, search bar included, to add someone whenever they're ready.
3. **Settings is never toured during onboarding.** Defaults (all three notification types on, start-on-login off) are sensible; the user discovers Settings on their own later.

