# Dusted. studio

The sidebar shortcut below Fragile opens the Dusted. studio. Its Proposal tab presents the proposed non-THC Turkish delight partnership, with print-to-PDF support. The visual reference is the user-supplied @dusted.cpt packaging screenshots: bold lowercase sans-serif, cream, brown, and four flavour accents. Typeface and colour specifications are approximations until original assets are supplied.

## Connect shared tools

Open **Dusted. → Workstation**. The studio uses a project named `Dusted.` or `Dusted` (case-insensitive). If no such project exists, use **Create Dusted. project**, review the form, and save. This reuses the existing project creation and authentication flow. The proposal is available even before connection.

Chat and moodboard reuse `brand_messages` and `brand_moodboard_items`, filtered by this project's ID. No new migration is necessary if `supabase/fragile-studio.sql` was already applied. If the UI reports missing shared brand tables, apply that existing script in Supabase SQL Editor. Project notes use the existing `supabase/project-workspaces.sql` schema.

Brand chat, moodboard, tasks, events and notes are shared with authenticated team members. This provides separate project views, not separate access permissions for the brand owner. Do not give a new viewer team access merely to share the proposal; use **Print / Save PDF** for the static review document.

## Contents

- Workstation: project events, tasks, assignments and a link to the full project workspace.
- Brand chat and image/link/colour/note moodboard, with creator-only deletion.
- Proposal: identity and product references, Instagram Reels and YouTube Shorts concepts, five partner channels, a personal promotion approach, a 30-day plan and workspace demonstration.
- Greater Cape Town contact shortlist: twelve suggested organisations, contact roles, area/channel filters, official-contact search links, personalised draft preparation and project-task shortcuts. These are research leads, not verified contacts or confirmed partners. The list also appears in the exported proposal.
- Outreach kit: content-response tracking guidance, permission and channel-specific editable email drafts, project task shortcuts and an owner meeting brief. Drafts and the brief are temporary until saved in project notes; they reset on reload/sign-out.

The user clarified that the product covered by this proposal will not be THC-infused. The proposal and every outreach draft explicitly cover that non-THC range. The supplied screenshots are visual references only, and final product assets must accurately represent the new product. The user asked for a personal promotion plan without costing, so pricing, commission figures and the scenario calculator are omitted from the presentation and email drafts.

Nothing sends email or connects affiliate tracking, checkout or payments. The order route, final flavours, product facts and content approvals need owner agreement. South African contact/consent guidance is included with reference links, but no live policy or Instagram verification is claimed.

## Local checks

`python3 tests/dusted-studio.py` uses simulated Supabase records and Chromium. It checks project isolation, chat/moodboard writes, event/project links, identity styling, cost-free proposal, outreach task starters, draft edits/copy, meeting brief, tasks, missing-project recovery and mobile widths. It exports a sample review PDF to `/workspace/outputs/Dusted-Promotion-Proposal.pdf`. This test never writes to the live database.

Fragile remains covered by `python3 tests/fragile-studio.py`; the existing project workspace and calendar tests cover linked records and date interactions.
