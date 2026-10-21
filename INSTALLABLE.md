# Installable Quest

Quest uses the existing Supabase accounts and permissions. There is no separate app login and no offline copy of team data.

## Build and deployment

Run `node scripts/build.mjs`. The generated `dist/` directory is the deployment output configured in `vercel.json`; generated files are not committed. This uses only Node's built-in libraries.

The build gives each local script and stylesheet a content-hashed URL, pins those URLs in the HTML, and creates a release identifier. This prevents an old cached controller from being served under a new controller's URL. The installation dialog shows the release identifier for support.

The service worker caches only an exact allowlist of public scripts, styles, icons and the generic offline page. Navigations always use the network and fall back to the generic offline page if unreachable. It does not store dashboard HTML, authenticated responses, Supabase requests, uploaded files or message drafts. New authenticated requests still go through the existing database/storage permission checks.

A new worker waits for an explicit Update Quest action. The action is disabled while a supported chat composer has text, an edit dialog is open or a marked save is in progress. No automatic refresh interrupts an active draft. Offline form submissions are blocked with a clear message; they are not queued or represented as saved. Existing message drafts remain in the open page, not in persistent browser storage.

## Installation

Use **Install Quest** from sign-in or the sidebar.

- Android/desktop: use the supported browser installation prompt, address-bar icon or browser menu.
- iPhone/iPad: open Quest in Safari, choose Share, then Add to Home Screen.
- Already installed: the help dialog recognizes standalone mode where the browser exposes it.

Installation and prompts depend on the browser and operating system. Browser push notifications and app-store distribution are separate future milestones.

## Verification

`python tests/installable-browser.py` builds and serves the real output over local HTTP. It tests service-worker installation, cache boundaries, offline navigation, blocked offline writes, unsent messages, explicit updates, reconnection and permission revocation. Existing member-access, private-chat and session-startup suites cover account separation and sign-in recovery. Browser tests emulate phone viewports; they do not replace testing on actual phones.

Before announcing device support, check on a real iPhone and Android phone: install, sign in, close/reopen, navigate with the keyboard open, reconnect after losing a signal, receive a release update, and revoke a member's access from another session. Use test accounts for these checks.

No database migration, DNS change, paid account or email/push delivery is required for this milestone.
