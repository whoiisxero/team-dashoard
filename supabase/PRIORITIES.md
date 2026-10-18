# Priorities, goal deletion and Team chat room

Run `priorities-and-goal-delete.sql` in Supabase SQL Editor to activate the new
fields and goal delete permissions. It preserves existing records except for the
requested priority update to the project named Fragile (case and surrounding
spaces ignored). It sets that project to Very important with a red highlight,
without changing its status, notes, events or tasks. The script's final query
returns the matching project and stored values. If that result has no rows, no
matching Fragile project was found; check its exact name before changing the query.
Rerunning this script intentionally reapplies the Fragile priority.

Projects and tasks support Normal, Important and Very important. Priority colours
are red, amber, violet or blue. A label accompanies each important highlight for
accessibility. The member can change these through Priority & colour on project
cards, the project workspace, task boards and workspace tasks. Changing a project
priority does not change the priority of all its tasks. Values are shared across
members and devices via Supabase. Existing team update permissions still apply.
The app does not pretend a save succeeded if database setup is missing.

Goals show Delete goal only for the creator. A confirmation prompt precedes an
irreversible deletion. The database independently restricts deletion to the creator
using an additional restrictive policy, even if an older broad team policy still
exists. Failed or denied deletions retain the card and display an error.

The existing discussions page is labelled Team chat room in its navigation,
heading and overview links. No message data is moved or deleted.

Local verification includes tests/priorities-browser.py and tests/create-goal.py
(simulated Supabase transport), plus tests/notifications-db.mjs (PostgreSQL via
PGlite, testing migrations, colour constraints and delete restrictions). These
tests do not change production data. After running the SQL in production, verify
Fragile's red label and test saving a task priority and deleting a disposable goal.
