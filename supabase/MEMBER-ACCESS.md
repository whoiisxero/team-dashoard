# Members and private projects

Apply `project-workspaces.sql`, `fragile-studio.sql`, `notifications.sql`, then
`member-access.sql`. The owner-specific installation file combines these in one
transaction with the requested account assignments. No service key is placed in
the browser. Existing records and message history are preserved.

`member_access` controls owner status, all/selected project mode and shared team
areas. `project_member_access` supplies explicit grants/exceptions; private
projects require an explicit grant. These tables cannot be written directly by
authenticated clients. Owner-only RPCs list/update ordinary members' access;
owner status cannot be changed through that interface. Unconfigured new members
have no project or shared access until the owner assigns it.

Restrictive PostgreSQL policies constrain projects, tasks, expenses, goals,
calendar events, notes, brand chats, moodboards and notification snapshots,
including existing unread notifications. These guards also constrain old broad
team policies. Creator-only edits/deletions still apply. Records retain their
scope if project deletion clears their foreign key, preventing an orphaned
private record from becoming a shared team item. Old notifications whose source
has disappeared remain owner-only because their scope cannot be recovered.

The requested configuration is: Quan is the owner; Tertius has all projects except
Dusted and retains shared areas; Josh has Dusted only, without general chat,
team budget or unlinked records. Dusted's project is private, so its brand chat
becomes the Dusted team chat available only to Quan and Josh. Membership is tied
to auth user IDs, never display names. Owner assignments belong in the private
installation file rather than this public repository.

Members lists online status and gives the owner project checkboxes and a shared
areas toggle. Permissions are fetched before the signed-in UI is displayed and
rechecked every 30 seconds and on data refresh. Missing/unavailable permission
checks fail closed to Home. Revocation clears cached studios, notes, dialogs and
notifications on the next refresh. Data previously read cannot be recalled from
a member's device. Static design/demo copy is still a public static site asset;
private working data is protected by database policies.

Presence uses authenticated RPCs with server timestamps. A per-tab session key
keeps multiple tabs independent. Heartbeats run every 30 seconds; the server
considers a member online if any tab has contacted it within 90 seconds. Sign-out
removes that tab's heartbeat; abrupt disconnects expire. Connection failures show
status unavailable, not false offline/online counts. Browser throttling can delay
updates. No client-supplied identity or timestamp is trusted.

This change scopes the in-app inbox. Existing database HTTP notification hooks
on these tables are paused during installation because a service-key handler
can bypass RLS. Hook names are recorded in `paused_notification_hooks`, without
credentials. The separately deployed email/webhook function is not in this
repository; update its recipient filtering before re-enabling these hooks.
Brand chat has no new external email trigger.

Validation: `tests/member-access-db.mjs` uses PGlite with real roles/RLS;
`tests/member-access-browser.py` tests actual screens with a scoped transport.
Legacy feature tests use `full_access_fixture.py` for an explicit owner session.
