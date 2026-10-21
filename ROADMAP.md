# Quest: next steps toward an installable app

Prepared 20 October 2026. This is a proposed work plan; it does not change the live dashboard.

## Starting point

Quest is already a web app: it runs in a browser, stores shared data in Supabase and deploys through Vercel. It has project workspaces, a calendar, tasks, goals, notes, brand studios, moodboards, chat, notifications and owner-managed project permissions. The user confirmed that Jen's latest login and Fragile access repair worked.

The recommended next destination is an installable Progressive Web App (PWA). This keeps the existing dashboard and adds a home-screen icon and an app window on supported phones and computers. An app-store version can follow if the team needs it.

## Implementation checkpoint — 21 October 2026

The installable-app milestone is implemented, browser-tested and pushed for deployment. See [INSTALLABLE.md](INSTALLABLE.md).

Daily workflow tools are implemented with browser and PostgreSQL permission tests: My day, in-app reminders, private project/moodboard uploads, scoped search and activity history. Their backend requires one run of the complete setup SQL in Supabase; see [DAILY-WORKFLOW.md](DAILY-WORKFLOW.md). Actual phone installation and live Storage upload/download still need checking after setup. Email/push delivery, app stores, a custom domain, hosted staging and a live backup/restore have not been activated by this work.

The owner invitation flow remains a separate future milestone; the user chose to build installation and daily workflow first.

## 1. Make member setup reliable

**First work session: build an owner-only invitation and access flow.**

- Let Quan invite a member, choose their display name and select their projects from the Members page.
- Show invitation status, membership status and assigned projects together, with clear success and failure messages.
- Use a protected server endpoint for invitations. Check the caller's owner permission on the server; keep Supabase administrative credentials on the server.
- Save membership and access records with safe defaults and support retrying incomplete invitations without duplicates. Explain when an invitation email was sent but project setup still needs attention.
- Link brand studios to stable project IDs or unique brand identifiers. Renaming a project must not break its page, chat or permissions.
- Make creating or connecting a missing brand project an explicit owner action, with a visible confirmation.
- Verify existing private-room invitations after connecting brand project records.

Preserve these access rules:

| Member | Projects | General team chat | Private conversations | Members page |
| --- | --- | --- | --- | --- |
| Quan | All | Yes | Rooms Quan is invited to | Yes |
| Tertius | All except Dusted. | Yes | Only invited rooms | No |
| Josh | Dusted. only | No | Dusted. conversation with Quan | No |
| Jen | Fragile only | No | Quan & Jen conversation | No |

**Ready when:** adding a member requires no pasted SQL; each account can sign in and open its intended workspace; direct database requests and notifications respect the same project and room boundaries. Removing access also clears any already-open private content.

## 2. Improve the team's daily workflow

Prioritize features that build on what already exists:

1. **My day:** today's events, assigned tasks and overdue work, scoped to the signed-in member's projects.
2. **Useful reminders:** due-date and event reminders with per-member preferences. Extend the existing notification centre rather than creating a second inbox.
3. **Project files:** upload photos, documents and moodboard references directly from a phone. Apply project permissions to file storage and downloads.
4. **Search:** find accessible tasks, events, notes and messages in one place.
5. **Activity history:** show who changed a task, event or project and when, without revealing inaccessible projects.

Before enabling automated emails, verify that the live notification function filters recipients by current project and private-room access. Email delivery and in-app notifications need separate verification.

**Ready when:** each member can find their work, receive a useful reminder and add a reference from a phone. Calendar dates and reminder times remain correct in Africa/Johannesburg and any explicitly selected event time zone.

## 3. Make Quest installable

- Add the app manifest, Quest name, Q icons and supported standalone display settings.
- Provide clear installation help for Android, iPhone and desktop. Installation controls vary by browser; iPhone may require Add to Home Screen.
- Add a lightweight service worker for public static assets and a clear offline screen. Keep authenticated API responses, private chats, files and permission data out of offline caches in the first version.
- Show connection state, preserve unsent drafts appropriately and give failed requests a retry action. Do not imply that an unsent action has been saved.
- Coordinate app updates so old scripts and new pages do not get mixed, and avoid refreshing while someone is writing a message or note.
- Test touch controls, keyboard appearance, safe areas, long messages and navigation on actual iPhone and Android devices.
- Consider `app.aiquest.co.za` as the dedicated address, after reviewing the existing domain setup. No DNS changes are included in this plan.

**Ready when:** Quest installs and opens from a home-screen icon, sign-in survives closing and reopening it, updates arrive safely, and a lost connection produces a useful message. Revoked access remains revoked after reopening or reconnecting.

Push notifications can follow with explicit opt-in and device testing. Support depends on the browser, operating system and installation state; do not promise identical behaviour on every phone.

## 4. Decide whether app stores add enough value

Use the installed web app with the team first. If App Store/Google Play distribution or native features become necessary, evaluate a Capacitor wrapper around the existing app before considering a separate native rewrite.

That stage needs developer accounts, signing, device testing, privacy information and store review. Review fees and platform requirements before committing to publication. Maintain the same Supabase permission rules in every client.

**Decision point:** continue with the PWA if installation and normal team workflows are sufficient; plan an app-store release when the team can name the additional capabilities it needs.

## Delivery setup

- Keep a separate test environment and preview deployment for membership, invitation and database changes.
- Replace one-off setup scripts with ordered, repeatable database migrations and record which migrations the live project has received.
- Continue the existing browser and database permission tests. Add real-device checks for installation, sign-in and reconnecting.
- Keep published releases identifiable for support and retain a working rollback path.
- Establish a backup/export and restore process appropriate to the current Supabase plan; verify a restore rather than assuming backups are available.
- Gradually move the large page script into smaller modules as related features change. A framework rewrite is not required to make Quest installable.

## Recommended order when work resumes

1. Owner invitation and project assignment flow.
2. Stable brand-project links and verification of all four member accounts.
3. Installable PWA with safe updates and offline messaging.
4. My day, reminders and phone uploads, chosen with the team's feedback.
5. App-store decision after the team has used the installed version.

No deadline or store launch date is assumed. Complete and test one milestone before starting the next.
