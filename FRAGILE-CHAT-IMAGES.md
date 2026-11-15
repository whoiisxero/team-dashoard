# Fragile brand-chat images

In Fragile → Brand chat, Photos selects up to four JPG, PNG, WebP or GIF images (8 MB each). Members can preview and remove selections, add a caption or post photos by themselves, and open shared photos full size.

This uses the existing brand_messages.image_paths column and private quest-thread-images bucket installed for Dusted conversations. No database migration or permission change is introduced. Existing project access and editing rules govern message reads, authenticated image downloads and uploads. Other studios retain their current chat controls.

Unsent files stay in memory. Failed posts preserve text and selections; retrying the same photo post reuses its message ID and completed uploads to avoid duplicate messages after an ambiguous response. Drafts, downloaded blob URLs and the image viewer are cleared on account/project reset. Images load near the viewport and are excluded from offline caches.

The author's stored attachments are removed on a best-effort basis after a confirmed message deletion. Abandoned uploads can remain private storage objects, as with the existing conversation uploader; background orphan cleanup is outside this change. A missing conversation-storage setup preserves the draft and gives the owner the existing setup link.

Validation:

- node --check fragile.js
- node --check brand-chat-images.js
- node scripts/build.mjs
- python tests/fragile-chat-images-browser.py
- python tests/fragile-studio.py
- python tests/dusted-threads-browser.py
- PGLITE_MODULE=/tmp/quest-fragile-images-db/node_modules/@electric-sql/pglite/dist/index.js node tests/dusted-threads-db.mjs

The Postgres test now covers Fragile image-only posts, same-project/author paths, view-only members, excluded and anonymous users, and revocation. Browser checks use simulated storage and include limits, previews, failed and ambiguous sends, authenticated blob viewing, retries, deletion, disabled uploads for view-only members, denied reads, pending uploads/downloads after reset, and a 390px layout. Actual device uploads are a separate live check.
