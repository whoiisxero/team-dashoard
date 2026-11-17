# Home trading access

The owner, Tertius and Josh can use the existing Quest Lab below the Home globe. Tertius and Josh start on Forecast; the owner keeps the existing Universe default. The full-page view and Market charts shortcut use the existing routes. Forecast remains explicitly labelled as a synthetic demo.

`GET /api/trading-access` checks the caller's current Supabase user, own `my_team_profile` and `my_dashboard_access` using their JWT and the public project key. It returns only `{allowed: boolean}` with `Cache-Control: no-store`. It does not read a member directory, projects, chats or private work. No database migration is needed.

The two invited members are matched by their exact, case-insensitive, administrator-managed `team_members.display_name` on the server. Members cannot edit that table. If their names change, update `server/trading-members.mjs`; do not add a member-name list to browser assets. Personal-only accounts, studio-only guests and private My Fragile guests are excluded. This capability does not grant owner privileges or access to other workspaces.

The client keeps permission in memory for the same signed-in member while rechecking access, discards late checks after an account change, and removes the lab if verification fails. A failed check retries on the existing refresh/reconnect path. Authenticated API responses are not cached by the service worker.

Validation: `node tests/trading-access-server.mjs`; build the demo with `node scripts/build-quest-lab-demo.mjs`, then run `python tests/quest-lab-demo-browser.py`. The latter covers both members, placement below the globe, Forecast default, market-chart navigation, refresh continuity, revocation, account changes, private-workspace and roster restrictions, and a 390px layout. These tests use transport fixtures, not live member sessions or market prices.
