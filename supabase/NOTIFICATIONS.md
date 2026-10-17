# Team notification inbox

Apply `notifications.sql` in the project's Supabase SQL Editor. Run the whole
script once; it is transactional and can be rerun. It assumes the existing team
tables, calendar_events, is_team_member() function and supabase_realtime
publication are already present. It does not change existing application records
or backfill old activity.

The migration creates a per-recipient notification table and AFTER triggers for
projects, tasks, expenses, goals, discussion messages, calendar events, team budget
settings and roster changes. New events, notes edits and deletions are included.
Unchanged writes are ignored. Activity snapshots retain a short title; discussion
message bodies and calendar notes are not duplicated into the inbox.

Actor identity comes from auth.uid(), not a browser-provided name or created_by.
The actor does not receive a notification about their own action. SQL Editor and
server-side changes without an end-user identity appear as **Team admin** and
notify all current members. Activity generated before a new member joins is not
sent retrospectively to that member.

RLS limits each inbox to its current team member. Authenticated users can update
only the read_at column on their own notifications; they cannot create, edit,
delete or forge activity. A trigger failure rolls back the source write as part
of the same transaction. Deleted source items retain a notification; opening them
shows the section with an explanation that the item was removed.

## Interface

The header bell and sidebar open Notifications. The unread badge counts all unread
rows, not just the current page. The initial list shows the latest 50 entries;
Load older notifications fetches another 50. Mark as read and Mark all as read
persist in the database across devices and sessions. Opening a notification marks
it read and opens the relevant section; calendar notifications open the event and
its notes when it still exists. Loading and write errors are displayed without
pretending that an inbox is empty or that a read action succeeded.

Realtime refresh is supplemented by a visible-tab check every 30 seconds and on
focus. This is an in-app inbox, not browser push, email or WhatsApp delivery.
If the migration is missing, the app displays setup instructions and keeps the
rest of the dashboard usable.

## Verification

Local PostgreSQL-compatible tests use PGlite 0.3.14:

```sh
npm install --prefix /tmp/quest-notification-db --cache /tmp/quest-npm-cache --no-package-lock --no-audit --no-fund @electric-sql/pglite@0.3.14
PGLITE_MODULE=/tmp/quest-notification-db/node_modules/@electric-sql/pglite/dist/index.js node tests/notifications-db.mjs
python3 tests/notifications-browser.py
```

The browser test uses simulated Supabase transport. No local test changes the live
database. After applying the SQL in production, sign in as Quan and create an
event, then sign in as Tertius and verify the unread notification, event link,
notes and read status. Repeat in reverse. Supabase publication delivery and live
account access still require that production smoke test.
