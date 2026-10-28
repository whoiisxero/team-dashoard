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
