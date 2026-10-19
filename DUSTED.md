# Dusted. studio

The sidebar shortcut below Fragile opens the Dusted. studio. Its Proposal tab is an internal workspace and owner-review demonstration, with print-to-PDF support. The visual reference is the user-supplied @dusted.cpt packaging screenshots: bold lowercase sans-serif, cream, brown, and four flavour accents. Typeface and colour specifications are approximations until original assets are supplied.

## Connect shared tools

Open **Dusted. → Workstation**. The studio uses a project named `Dusted.` or `Dusted` (case-insensitive). If no such project exists, use **Create Dusted. project**, review the form, and save. This reuses the existing project creation and authentication flow. The proposal is available even before connection.

Chat and moodboard reuse `brand_messages` and `brand_moodboard_items`, filtered by this project's ID. No new migration is necessary if `supabase/fragile-studio.sql` was already applied. If the UI reports missing shared brand tables, apply that existing script in Supabase SQL Editor. Project notes use the existing `supabase/project-workspaces.sql` schema.

Brand chat, moodboard, tasks, events and notes are shared with authenticated team members. This provides separate project views, not separate access permissions for the brand owner. Do not give a new viewer team access merely to share the proposal; use **Print / Save PDF** for the static review document.

## Contents

- Workstation: project events, tasks, assignments and a link to the full project workspace.
- Brand chat and image/link/colour/note moodboard, with creator-only deletion.
- Proposal: identity reference, product record register, workspace plan, supplied terms and an owner-review agenda.
- Review checklist: internal record and asset tasks, a meeting brief, and a shortcut to saved project notes. The brief itself is temporary until copied into a project note; it resets on reload/sign-out.

The screenshots identify a THC-infused product. The demonstration does not include promotional campaigns, sales outreach, referral tracking, checkout or payment integration. The supplied R250 box price and 12% rate are recorded as internal information, with the arithmetic R30; no sales or legal authorisation is represented as complete.

## Local checks

`python3 tests/dusted-studio.py` uses simulated Supabase records and Chromium. It checks project isolation, chat/moodboard writes, event/project links, identity styling, supplied figures, meeting brief, tasks, missing-project recovery and mobile widths. It exports a sample review PDF to `/workspace/outputs/Dusted-Owner-Review.pdf`. This test never writes to the live database.

Fragile remains covered by `python3 tests/fragile-studio.py`; the existing project workspace and calendar tests cover linked records and date interactions.
