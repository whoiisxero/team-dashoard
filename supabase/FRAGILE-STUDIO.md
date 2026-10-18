# Fragile clothing-brand workstation

The sidebar's Fragile shortcut and Fragile project cards open the dedicated studio.
The brand heading uses the locally bundled UnifrakturMaguntia gothic font (OFL
license retained in assets/fonts). A charcoal, warm-white and orange palette is
scoped to the studio; other dashboard sections keep the selected theme.

The studio connects to the existing project whose trimmed name is Fragile,
case-insensitively. It does not create, rename, or move any projects. Workstation
shows that project's actual tasks and events, lets members create linked items,
and opens the original project workspace for notes and expenses.

## Shared brand chat and moodboard

Run `fragile-studio.sql` once in Supabase SQL Editor. It is repeatable and leaves
existing team-chat messages, project notes, events and tasks untouched. It adds
brand_messages and brand_moodboard_items with project-scoped queries, team-only
read access, and author-only inserts/deletes. No browser credentials or additional
service account are needed. Shared tables must be set up before posting or pinning.

Brand chat shows the latest 100 messages and supports confirmed deletion of the
current member's own posts. Moodboard shows the latest 200 pins: direct HTTPS
image URLs, reference links, colour swatches and written ideas. This version uses
image links, not file uploads. Some image providers block embedding; failed images
show an explanation and keep an Open reference link. Images use no-referrer;
external reference links use noopener/noreferrer. Content is rendered as text,
never interpreted as HTML. Authors can remove their own pins after confirmation.

Database policies independently enforce author ownership and team membership.
Realtime subscriptions are filtered by project, with visible-tab polling every
30 seconds. Signing out resets local studio state and unsubscribes. Changing
projects never mixes chat or pins between projects.

If notification capture is installed, the migration attaches it to brand activity.
Installing the current notifications.sql afterwards also detects the brand tables.
No existing general team-chat webhook is automatically extended to email brand
messages; those triggers remain separate from the in-app activity inbox.

## Checks

`python3 tests/fragile-studio.py` exercises the actual studio UI with simulated
Supabase storage. `tests/notifications-db.mjs` exercises the actual migration,
repeated installation, permissions, URL constraints and notification integration
using PGlite. No test mutates production data. After applying the SQL, sign in as
Quan, post a brand message and pin an image URL, then sign in as Tertius to confirm
both are shared and that deletion is limited to the author.
