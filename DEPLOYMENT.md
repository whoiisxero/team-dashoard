# Delivery and recovery

Production is deployed from `main` through Vercel. `node scripts/build.mjs` produces `dist/`; release identifiers are visible under Install Quest. GitHub checks run without production credentials and cover the static build, browser workflows and PostgreSQL permission rules.

For future releases with database changes, use a separate Supabase test project and a Vercel preview deployment first. Use test accounts with the same owner/project/private-room boundaries. No separate hosted test project has been provisioned by this work.

The daily-workflow schema change is additive and recorded in `public.quest_schema_migrations`. Apply the complete setup SQL before enabling its backend features for the team. Keep a migration record alongside the source commit and note the successful result. The app handles an uninstalled workflow backend without blocking existing calendar or project use.

Before future destructive migrations, check the backup/export facilities actually available on the project's Supabase plan, take the appropriate backup/export, and rehearse restoring it into the test project. Do not assume that the free plan includes automatic recoverable backups. No production backup or live-data restore has been performed here.

For a frontend regression, use the prior working Vercel deployment or revert the source commit. A frontend rollback does not undo database changes. The additive workflow schema can remain while the previous frontend runs; do not remove tables or private Storage objects as a rollback shortcut. Review pending service-worker updates and existing installed clients during release checks.

App Store/Google Play publication, developer accounts, signing, a custom domain and outbound email/push delivery remain separate decisions. The installed web app is the first release target.
