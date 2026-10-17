# Project workspaces

Run `project-workspaces.sql` once in Supabase SQL Editor. The script is
transactional, repeatable and preserves existing records. It adds nullable
`tasks.assigned_to` and a `project_notes` table with team read access and
creator-only note editing. No additional service or account is needed.

The assignee foreign key references the team roster; removing a member clears
that member's assignments. Notes belong to a project and are removed if that
project is deleted. Authenticated clients may edit note titles and bodies, but
cannot change ownership or move an existing note to another project.

Project cards on Projects and Dashboard, and project shortcuts in the sidebar,
open a project workspace. Its event, task, expense and notes lists are scoped to
the selected project. Expense totals explicitly cover all time. New-item buttons
preselect that project. Event notes remain available inside events, separate from
standalone project notes. Assigned tasks display their assignee; the creator is
labelled separately and is never presented as the assignee by default.

Without the migration, existing project data and event creation remain usable;
standalone notes display a setup message, and task creation works when no assignee
is selected. Apply the migration before using task assignments.

If the notification function from `notifications.sql` is already installed, the
workspace migration attaches it to project note changes. If notifications are
installed later, the current notification migration also detects project_notes.
Both migrations need to be applied for persistent project-note notifications.

Verification uses simulated browser transport in tests/project-workspace.py,
with migration and permission checks included in tests/notifications-db.mjs.
No test writes to the live database. After applying the migration in production,
open Loden, add a note and an assigned task, refresh, then confirm they appear in
that project and not in Reddington. Use the other team account to check sharing.
