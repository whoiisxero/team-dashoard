# NGL social media studio

NGL is available under **Studios**, using Quest's existing project permissions,
tasks, calendar, notes, brand chat, moodboard and private project files.

## Connect the restricted project

Open `/setup-guide.html#ngl-studio` as the owner and copy the complete NGL setup
query. Run it in a new Supabase SQL Editor query as `postgres`. The transaction
creates or reuses NGL, permits the owner and the existing member Tertius, denies
other members, and preserves unrelated permissions and existing project content.
The result lists the permitted members and editing access. Refresh Quest after
the query succeeds. Database setup is separate from frontend deployment.

The build generates `/setup/ngl-studio.sql` from
`scripts/prepare-ngl-studio.mjs`; no secrets are included. The schema migration
adds an authenticated member-name function scoped to the accessible NGL project.

## Original artwork

**Add NGL logo** accepts an original JPG, PNG or WebP up to 10 MB. It shows the
entire image without cropping and saves the unchanged bytes in private project
storage only after **Save logo**. Failed saves retain the preview for retry.
Previous uploads remain in Files. Read-only studio members can see the saved
logo; replacing it requires project editing access. Account and access changes
clear artwork previews and revoke local object URLs.

The illustration shown inline in chat is not bundled as an image file. The
original can be selected directly through the studio's logo control.

## Validation

`node scripts/build.mjs`, JavaScript syntax and `git diff --check` pass.

- `tests/ngl-studio-db.mjs`: real Postgres RLS for owner/Tertius-only project
  access, edits, chat, moodboard, notifications, logo metadata and storage;
  other/future-member denial; repeatable setup and preserved history.
- `tests/ngl-studio-browser.py`: simulated transport covering task/date forms,
  scoped assignees, chat, notifications, moodboard, uploads, original-logo byte
  preservation, failed-save retry, read-only controls, mobile fit and account/
  access-change cleanup.
- `tests/sidebar-sections-browser.py` and `tests/daily-workflow-browser.py`:
  existing navigation and shared file/search/activity workflows.

These checks use local fixtures and do not verify production database setup or
real-device installation.
