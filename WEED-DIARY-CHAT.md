# Weed Diary conversation

Weed Diary has separate **My entries** and **Chat · Quan & Tertius** tabs. The owner can use both. Tertius sees the conversation only; this feature does not grant him access to the owner's saved diary entries, notes, projects or other conversations.

The dedicated diary page was brought forward from the earlier local draft. Existing matching personal notes are displayed without changing their IDs, saved contents, categories or access rules. New entries use `Weed diary / Private`. The page is listed under Studios and linked from My Fragile.

The conversation reuses Quest's private-chat controller, database permissions, realtime updates and in-app notification triggers. It has its own room, separate from the existing Quan/Tertius conversation. Moving between its embedded and ordinary private-chat views preserves an unsent draft. Failed sends leave the draft in place. Current room membership controls access after reopening and reconnecting.

Images and documents are covered in [PRIVATE-CHAT-FILES.md](PRIVATE-CHAT-FILES.md). Use `/setup-guide.html#weed-diary-uploads` to activate both the room and private uploads with one complete query.

## One-time production setup

There is no Supabase administrator connection in the execution environment, so the production room must be created by the owner:

1. Open `/setup-guide.html#weed-diary-chat` and select **Copy Weed Diary chat SQL**.
2. Paste the entire query into a new Supabase SQL Editor query and run as `postgres`, without a partial selection.
3. Confirm the result contains Quan and Tertius with `participant_count = 2`.
4. Refresh both Quest accounts, then open **Studios → Weed diary → Chat**. The direct entry link is `/?view=weedDiary`.

The source query is `supabase/maintenance/weed-diary-chat.sql`; the build publishes it at `/setup/weed-diary-chat.sql`. Its final line is `-- END WEED DIARY CHAT SETUP`. The query is repeatable and checks for exactly one existing owner and Tertius account. It refuses a conflicting room, unexpected third participant or incompatible existing permissions. It does not replace permission functions or change personal-note/project grants. Until setup is completed, the owner sees setup guidance rather than an active chat.

## Validation

- `node tests/weed-diary-chat-db.mjs`: executes the setup against PostgreSQL through PGlite, including repeat setup, account resolution failures, exactly two participants, existing conversation preservation, RLS, private notes, notifications, sender spoofing and revocation.
- `python tests/weed-diary-browser.py`: legacy-note discovery, note editing and failed saves, metadata preservation, account changes and mobile layout.
- `python tests/weed-diary-chat-browser.py`: owner/member views, direct entry after sign-in, send/retry/realtime/delete, draft continuity, unrelated-room isolation, no diary-note reads for Tertius, revocation, phone layout and complete setup-query copying.
- Existing `private-chats-browser.py`, `direct-chat-browser.py` and `private-fragile-sharing-browser.py` cover the shared controller and current My Fragile restrictions.

The build keeps authenticated responses and private chat content out of the service-worker cache. Browser checks use fixtures; PostgreSQL checks exercise the actual permission functions. These checks do not establish that the production room has been created or that the hosting deployment has completed.
