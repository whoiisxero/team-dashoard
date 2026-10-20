# Invite-only project conversations

Apply `private-chats.sql` after `member-access.sql`. The private installation
file for Jen includes all prerequisites, matches the existing login by exact
email, adds the display name Jen, grants only Fragile and creates Quan & Jen.
That room's only participants are Quan and Jen. Existing Fragile brand chat
continues to serve its project members. No chat history is copied between rooms.

The installation file works whether or not the preceding member-access setup
has been applied. When access has already been configured, it preserves other
members' settings. Rerunning keeps the existing room and message history while
reapplying Jen's requested Fragile-only access. An unknown login or ambiguous
brand project aborts the whole transaction instead of granting another account.
Account email assignments stay outside the public repository.

`private_chat_rooms`, `private_chat_members` and `private_chat_messages` use
separate RLS policies. Both an explicit room invitation and access to its project
are required. Owners also need a room invitation. Clients cannot create rooms,
edit invitations, change room metadata or update messages. Only authors may
delete their messages, and the sender ID must match the authenticated account.
Restrictive guards also constrain older permissive policies.

Private message notifications use a separate capture trigger. Recipients must
still have both forms of access; the sender is excluded. The inbox stores the
room title, never message text. Existing notification rows are hidden immediately
if membership or project access is revoked. Apply this migration after rerunning
`member-access.sql`, since it extends the notification access guard.

Only accessible rooms appear under Private chats. Opening a room loads its latest
100 messages and participants, supports realtime updates, and checks access again
on refresh and every 30 seconds. Failed sends keep the draft. Signing out, changing
accounts or losing access clears the selected conversation. Responses from old
sessions are discarded. In-app notifications open the correct room.

No email is sent by this feature. No existing general chat or brand chat is
repurposed or made private. Static UI files contain no private conversation data.

Validation:

- `tests/private-chats-db.mjs`: real PostgreSQL RLS/roles in PGlite, invitations,
  denied reads/writes, author ownership, notification isolation and revocation.
- `tests/private-chats-browser.py`: actual UI with scoped storage, escaped text,
  send/retry, deletion, notification links, account changes, realtime and mobile.
- The account-specific installation file is separately tested for initial/repeat
  setup, preserved history/settings, and rollback if the login is missing.
