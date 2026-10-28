# Personal-only workspaces

Apply the current daily workflow upgrade, or copy the complete SQL from
`/setup-guide.html`. An owner can then use Members → Create personal-only
workspace for an existing team member. This removes that member's project
grants and other private-room invitations, and creates a conversation with the
owner who performed the setup. It preserves writing, business notes and saved
appearance preferences on repeat setup. Owner accounts cannot be converted.

Personal-only mode is a database permission boundary. Project/shared access
helpers deny these accounts even when a legacy access editor sets broad flags.
The roster is hidden except for the caller's own profile; a separate scoped RPC
returns names only for participants in a conversation the caller can access.
Personal rooms have no project. Their invited personal owner and creating team
owner are the only eligible participants. Existing project rooms still require
both invitation and current project access.

Personal profiles and notes are private to their owner. The team owner cannot
read another member's writing through normal authenticated APIs. Notes use
explicit saves, stable IDs for retries and revision checks for conflicting edits.
Writing is never persisted in browser storage or the service worker cache.

Business items support categories, pinned notes, status, due times and reminder
times. Local times are converted in PostgreSQL using an explicit IANA time zone;
nonexistent daylight-saving times are rejected. Reminders use the existing
recipient-scoped inbox and deduplicate each note/reminder-time pair. Completing,
deleting or rescheduling work removes obsolete reminders on refresh. Personal
reminders are checked while Quest is open. Device push and background delivery
are deferred; this release does not request browser notification permission.

`scripts/prepare-personal-workspace.mjs EMAIL NAME OUTPUT.sql` is an alternative
private enrollment bundle for an already-created Supabase Auth account. Keep
its output out of the public repository. No user password is needed.

Validation: `tests/personal-workspace-db.mjs` exercises real PostgreSQL roles/RLS,
private notes even from the owner, chat isolation, reminders, conflicting edits,
time zones and account revocation. `tests/personal-workspace-browser.py` covers
onboarding, personalised UI, private writing, business work and account changes.

Private calendar: the complete setup also applies `20261028_personal_calendar.sql`.
My calendar stores personal appointments separately from team calendar events,
with date, optional time, time zone, location, notes and in-app reminders.
Only the author can read or change an event; even a team owner cannot inspect
another member’s calendar. Writes use a protected RPC with stable create IDs
and revision checks. The server rejects nonexistent daylight-saving times;
repeated times follow PostgreSQL’s standard-time interpretation. All-day
events retain their local date and use 09:00 local for their internal instant.
Deleting or rescheduling an event removes obsolete reminders.

Private pages appear near Home for personal-only members and owners. Missing
setup leaves those links visible with an explanation and disabled writes; no
client-side grant or email allowlist bypasses database access. If the workspace
is already personal-only, run the updated complete query and refresh; there is
no need to convert the member again. Phone push remains deferred.

`tests/personal-calendar-db.mjs` covers real RLS, private reminder delivery,
revocation, time zones, replay and conflicts. `tests/personal-calendar-browser.py`
covers private event CRUD, failed saves, date selection and mobile layout.
