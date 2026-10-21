# Daily workflow tools

## Activate the backend once

Build the complete SQL setup with `node scripts/prepare-workflow-setup.mjs`. Its default destination is `/workspace/outputs/quest-daily-workflow-setup.sql`; pass a different output filename as an argument if needed.

For an existing Quest installation with project permissions already enabled, use `node scripts/prepare-workflow-setup.mjs --upgrade` instead. This shorter file installs the private-chat prerequisite and daily workflow migration without replaying the older setup scripts. A preflight checks the required tables, permission functions and restrictive guards before making changes; use the complete setup if those are missing. Both paths preserve existing access assignments.

The command also creates an adjacent `-copy.html` file. Download/open that file in a browser and use **Copy complete SQL** to avoid copying only part of a file preview. Paste into a new SQL Editor query, clear any selection, confirm the last line is `-- END QUEST SETUP`, then Run. An **unterminated dollar-quoted string** error means the submitted query ended inside a function or `DO` block; replace the incomplete query with the complete file rather than adding a closing delimiter to a partial migration.

Run the whole file in the Quest Supabase project's SQL Editor using the normal administrator connection. It clears an aborted transaction and resets any impersonated query role first. The setup includes the current project, brand, notification and private-chat prerequisites, followed by the ordered migration `supabase/migrations/20261021_daily_workflow.sql`. It preserves existing memberships, access assignments, messages and project content. The database changes commit together; a failed statement rolls them back together.

The final result must say **Quest daily workflow ready**, with version **20261021_daily_workflow**. Refresh Quest afterward. No account-specific email matching or Fragile project-name lookup is required.

My day can already use the existing tasks and events. Until the backend is ready, the other new areas show a setup message and existing event creation/editing continues to use the earlier date-only fields.

## Features

- **My day:** today's accessible events, tasks assigned to the signed-in member, due work and overdue work. It defaults to Africa/Johannesburg; the member can choose a different day/time zone under Notifications.
- **Reminders:** preferences appear in the existing notification centre. Assigned task reminders are deduplicated per member/day; event reminders use the actual event time zone. The server supplies the event timestamp consistently across daylight-saving changes; nonexistent local times are rejected. Rescheduled/completed/reassigned items have obsolete reminders removed. Date-only events use 09:00 in their event time zone. A five-minute grace window supports checking an event at its start time.
- **Files:** private project uploads up to 20 MB. Supported photos include JPEG, PNG, WebP, GIF and HEIC/HEIF; documents include PDF, plain text, CSV, Word and Excel. Preview support for HEIC/HEIF depends on the browser. Downloads use authenticated Storage reads, not public or long-lived signed links. Uploaders and the owner can delete files within their current project access.
- **Moodboard uploads:** choose Upload photo inside a brand moodboard, or select the moodboard option while uploading a project photo. These references appear in a separate Uploaded references section under the existing moodboard.
- **Search:** searches accessible projects, tasks, events, notes, files, general/brand messages and invite-only messages. The database function uses the caller's RLS policies; sharing a project does not grant access to another member's private room. Results are limited to 50.
- **Activity:** the latest 100 accessible changes to projects, tasks, events, goals, notes, files and moodboard items. History starts when the migration is enabled. It records actor/title/action/time, not private chat bodies or previous note contents.

## Reminder delivery

Reminders are checked when the member opens Quest and while it remains active. If `pg_cron` is already enabled and scheduling is permitted, setup also registers one named job every five minutes. Otherwise foreground checks still work. The migration does not enable extensions or send emails.

Email and push are not enabled by this milestone. The existing live email function is not available in this repository and has not been audited here. Verify its recipient checks against current project and private-room permissions before re-enabling any external notification hook. The existing access migration keeps its safeguards for legacy HTTP hooks.

## File consistency and privacy

Storage objects use `project-id/uploader-id/random-id-filename`; both Storage policies and metadata policies enforce project access. Restrictive guards protect this bucket even if an older permissive Storage policy exists. Anonymous reads and object overwrites are blocked. The app uses `cache: no-store` for Supabase requests and `cacheControl: '0'` for uploads; file previews are temporary object URLs released when access changes or the user leaves their session.

An upload writes the object first and metadata second. If metadata fails, the client attempts object cleanup and keeps the upload dialog available for retry. Deletion removes the object before metadata and can be retried. These two APIs do not form a distributed transaction: interrupted clients or failed cleanup can leave private orphaned objects. Include orphan reconciliation and retention in storage maintenance. Deleting project metadata does not by itself delete the underlying Storage object.

## Verification

- `PGLITE_MODULE=... node tests/daily-workflow-db.mjs`: real PostgreSQL RLS tests for reminders, preferences, time zones, private search, file metadata/object policies, history, revocation and repeat-safe migrations. Storage API behaviour is modelled with database tables; this is not a live Storage upload test.
- `python tests/daily-workflow-browser.py`: scoped UI flows, a Johannesburg midnight boundary, cross-zone events, assignments, reminders, phone file selection, moodboard previews, cleanup/retry, search/history, account switches and setup failures.
- `python tests/installable-browser.py`: the built app and real service worker, including private-cache exclusion and reconnecting after access revocation.

The full SQL setup bundle and shorter upgrade are also applied in the database test to verify that they preserve existing access rules and uploaded-file metadata. The shorter upgrade is tested with missing private-chat tables, a query editor impersonating `authenticated`, repeat application and missing permission prerequisites. Actual phone installation and a live upload/download should be checked with a permitted test project after setup.
