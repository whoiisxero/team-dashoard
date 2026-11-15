# Weed Diary chat uploads

Quan and Tertius can attach up to four images or documents per Weed Diary chat message, at 20 MB per file. Supported formats are JPG, PNG, WebP, GIF, AVIF, HEIC/HEIF, PDF, Word, Excel, PowerPoint, TXT and CSV. HEIC/HEIF files download for viewing in a compatible app. Messages can contain files with or without text.

The existing private-chat surface hosts the picker in both the diary and ordinary conversation view. Image thumbnails open an image viewer; every file has a download button. Filenames are rendered as text. Selection, upload and confirmed message delivery have distinct status messages. Failed uploads retain the text and files. A stable message ID and idempotent RPC prevent duplicate messages or notifications after a lost acknowledgement. An unconfirmed send locks the original draft for Retry Send. Drafts and downloaded previews stay in memory; account changes and lost room access clear them. App updates wait for selected files and active sends.

## Activate in Supabase

Open `/setup-guide.html#weed-diary-uploads`, click **Copy uploads setup SQL**, and run the entire query in Supabase SQL Editor as `postgres`. The final line must be `-- END WEED DIARY UPLOADS SETUP`. The result lists Quan and Tertius with `participant_count = 2`. Refresh both accounts and open **Studios → Weed diary → Chat → Add images or documents**.

The build generates `/setup/weed-diary-uploads.sql` using `scripts/prepare-weed-diary-uploads.mjs`. It combines `supabase/migrations/20261115_private_chat_files.sql` and the existing two-person room setup into one transaction, preserving current room history. It can be rerun and also works when the earlier room setup has not yet been run. No administrator connection is available in the execution environment; publishing the UI alone does not activate production storage.

The migration adds attachment metadata to existing messages and a private `quest-private-chat-files` bucket. Object paths bind the room, uploader, message and file IDs. Unsent uploads are readable only by their uploader. Recipients can read a file once it belongs to a committed message. Every read/download checks current private-room access. Restrictive storage policies cover broad legacy policies; anonymous access and object overwrites are denied. The migration does not replace membership/permission functions or change diary-note access. Other private conversations keep their current text composer.

Downloads use authenticated Storage requests and local Blob URLs, without public or reusable signed download links. Deleting a message immediately removes the recipient's file access, then the app attempts to remove the uploader's stored objects. Interrupted uploads or failed cleanup can leave private orphaned objects; they do not become available to the other participant. This feature does not implement a storage cleanup scheduler.

## Verification

- `node tests/private-chat-files-db.mjs` executes the actual generated setup and migrations with PGlite, including reruns, existing data preservation, private pending/committed files, current-member access, message retry IDs, notification recipients, file validation, legacy broad-policy guards, deletion, archiving and revocation.
- `python tests/private-chat-files-browser.py` checks selection limits, previews and downloaded bytes, text/file-only sends, upload failures, lost upload/send acknowledgements, draft continuity, safe filenames, notifications, deletion, mobile layout, missing setup, stale downloads, account changes, revocation and complete SQL copying.
- Existing private-chat, Weed Diary and installation checks cover the shared controller, owner-only entries and app update behavior.

Browser checks use a scoped transport fixture; database checks exercise PostgreSQL policies. They do not verify production Storage delivery or actual mobile devices.
