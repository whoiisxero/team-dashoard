# Invited access to My Fragile

My Fragile stays author-only by default. The owner setup at
`/setup-guide.html#private-fragile-sharing` explicitly shares the existing owner's
`Fragile / Private` notes with the existing restricted Fragile collaborator.
Other writing, business notes, diaries, client workspaces and profiles remain
outside that grant.

The guest lands in My Fragile and can view, create, edit and delete its notes.
Database functions derive the workspace owner from the signed-in account and
validate the category, note ownership and revision. Notes keep their original
IDs and ownership. The guest receives no projects, brand studio, team chat,
private chats, member directory or general notebook. Directory hiding and
neutral attribution outside the workspace are preserved. Read-only grants and
revocation are enforced by the database as well as the interface.

The application release does not apply production database changes. Run the
complete generated query as postgres, then refresh Quest on both accounts.
`node scripts/prepare-shared-fragile.mjs` also creates a local complete SQL copy.

## Separate brand-chat clear

The owner-run SQL at `supabase/maintenance/clear-fragile-brand-chat.sql` deletes
Fragile brand messages, their replies/likes through existing foreign keys, and
matching brand-chat notifications for every member, including Kazz. Its project
lookup fails if normalized Fragile names are ambiguous. It does not delete
private-chat messages, moodboards, tasks or personal notes. It reports the
remaining message count. This is a deliberate maintenance action, not an
ordered migration, and it is never executed by the build or sharing setup.

The build publishes a copy at `/setup/clear-fragile-brand-chat.sql`. Sharing setup
can be rerun without clearing messages subsequently posted to the brand chat.

## Local verification

- `tests/private-fragile-sharing-db.mjs`: actual Postgres role and RLS checks for
  shared-note scope, revisions/retries, edits/deletes, read-only/revoked access,
  legacy permission-editor bypasses, unrelated data and a scoped chat clear.
- `tests/private-fragile-sharing-browser.py`: invited-only landing/navigation,
  category filtering before pagination, save/retry/delete, read-only fields,
  owner view, phone layout, account switching and discarded stale responses.
- Existing `fragile-personal-browser.py` and `personal-workspace-browser.py`
  checks preserve ordinary owner/client behaviour.
- Static build, inline/module syntax and whitespace checks.

No live deletion, permission update or shared-note read has been performed by
the local checks; all records in tests are synthetic.
