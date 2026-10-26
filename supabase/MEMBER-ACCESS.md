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

Only the owner can open Members, view online status or use its project checkboxes
and shared areas toggle. Non-owners cannot fetch the online list through the RPC;
their heartbeats still update so the owner can see their status. Normal names
used for message authors and task assignments remain available in their projects.
Sign-in reads `my_team_profile()`, which returns only the authenticated caller's
own membership through a secure function. Hiding the general roster with RLS must
not prevent an existing member from signing in. Unknown accounts still return no
profile. The client checks the returned user ID and falls back to the original
own-row lookup only when the new function has not been installed yet.
Permissions are fetched before the signed-in UI is displayed and
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

Invite-only conversations add an independent room-membership requirement; see
`PRIVATE-CHATS.md`. Jen's account is scoped to Fragile and the Quan & Jen room.

`migrations/20261026_project_edit_access.sql` adds independent project editing
limits. An existing member's null `editable_project_ids` retains editing in all
accessible projects. An explicit UUID array permits changes only in those
projects, including tasks, events, notes, brand chat, moodboards, files and
catalogue uploads. Viewing never grants invitation to a private room. The
owner-only Members editor saves viewing and editing scopes atomically; older
clients preserve editing limits. Server-side restrictive policies check both
the source and destination when moving an item. Creator-only rules still apply.

Invite/create an account in Supabase Authentication first. To prepare a scoped
enrollment for an existing account, run
`node scripts/prepare-member-enrollment.mjs EMAIL ACCOUNT_UUID EDIT_PROJECT OUTPUT.sql`.
The private output validates the exact email/UUID and named project, installs
the editing migration, adds membership, grants viewing of all current projects
and editing of the named project. Future projects need a fresh owner assignment;
general team areas and private rooms are not added. Run the entire output as
postgres, then check the returned per-project access rows before asking the
member to retry sign-in. No Auth password or service key belongs in that file.
