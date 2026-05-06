# Runbook: Back Up the Database

The SQLite file `data/accelerate.db` is the only stateful thing in the system. Everything else (code, static files, env vars) is reproducible. This file is not — losing it means losing every inquiry, every admin account, and every recipient.

## When to back up

- **Before every schema change** — non-negotiable
- **Before any destructive operation** — admin table cleanup, DELETE queries, file moves
- **Weekly** — scheduled cadence (manual until automated)
- **Before a Railway config change that might restart the service**
- **Before a major release that touches DB code**

## Backup methods

### Method A: Railway volume snapshot (preferred, fastest)

If the Railway plan supports volume snapshots:

1. Railway dashboard → service → Volumes
2. Click **Snapshot** on the `/app/data` volume
3. Wait for the snapshot to complete (seconds)
4. Note the snapshot ID + timestamp in your backup log

Snapshots live in Railway's infra. Good for point-in-time recovery, not great for off-site disaster recovery.

### Method B: Copy the file off Railway (required for off-site backups)

```bash
# Pull the DB file from the running service
railway run "cat /app/data/accelerate.db" > ~/backups/accelerate-$(date +%Y%m%d-%H%M%S).db
```

Alternative using SQLite's `.backup` command, which is safer on a live DB:

```bash
railway run "sqlite3 /app/data/accelerate.db '.backup /tmp/backup.db' && cat /tmp/backup.db" \
  > ~/backups/accelerate-$(date +%Y%m%d-%H%M%S).db
```

The `.backup` command respects WAL mode and doesn't require stopping the service.

Store the resulting file somewhere durable — **not** in the repo, **not** only on your laptop. Good options:
- Encrypted cloud storage (Google Drive, iCloud, 1Password)
- An external drive kept off-site
- A second cloud provider (for true disaster recovery)

### Method C: Live-copy during local dev

```bash
cp data/accelerate.db ~/backups/accelerate-dev-$(date +%Y%m%d-%H%M%S).db
```

Good enough for local dev. Not a production backup strategy.

## Verify the backup

Don't trust a backup you haven't tested:

```bash
sqlite3 ~/backups/accelerate-<timestamp>.db "SELECT COUNT(*) FROM inquiries;"
sqlite3 ~/backups/accelerate-<timestamp>.db "SELECT COUNT(*) FROM admin_users;"
sqlite3 ~/backups/accelerate-<timestamp>.db "SELECT COUNT(*) FROM notification_recipients;"
```

Non-zero counts that match production = backup is real.

## Restore

### Restore from Method B backup on Railway

1. **Stop the service first** — either scale to zero replicas or pause the deployment
2. `railway run "cp /dev/stdin /app/data/accelerate.db" < ~/backups/<timestamp>.db`
3. Restart the service
4. Verify admin login works and inquiries are present

### Restore locally

```bash
cp ~/backups/<timestamp>.db data/accelerate.db
```

(Make sure the local server is stopped first — better-sqlite3 holds a file lock.)

## Retention

Until we have an automated policy, keep:

- **Daily backups** for 7 days
- **Weekly backups** for 4 weeks
- **Monthly backups** for 12 months

Prune older backups monthly.

## Automation roadmap

See [`../../60-roadmap/backlog.md`](../../60-roadmap/backlog.md):

1. Scheduled backup job (cron or Railway cron trigger)
2. Upload to S3 or equivalent
3. Automated restore drill quarterly

## Never

- **Never store a backup only in the same environment as the primary** — Railway volume snapshots alone are not off-site backup
- **Never skip the verify step** — an untested backup is not a backup
- **Never commit a backup file to git**

## Related

- [`../../20-architecture/database-schema.md`](../../20-architecture/database-schema.md)
- [`../../../.claude/rules/database-migrations.md`](../../../.claude/rules/database-migrations.md)
- [`rollback-release.md`](rollback-release.md) — DB restore in a rollback
