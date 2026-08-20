# Production operations runbook

Sillage uses project-local PostgreSQL on its production VPS. Cloudflare R2
stores encrypted off-host backups in the private `sillage-backups` bucket.
Healthchecks.io receives readiness, WAL archive, database backup, and Active
Storage backup signals through the account's existing alert channels.

## Backup policy

- PostgreSQL: pgBackRest makes a full physical backup every day at 02:17 UTC.
  PostgreSQL continuously archives WAL, with a 15-minute archive timeout, for
  point-in-time recovery. Full backups and the WAL required by retained backups
  are kept for 30 days.
- Active Storage: restic makes an encrypted incremental snapshot every 15
  minutes. It keeps every snapshot for 24 hours, one hourly snapshot for seven
  days, and one daily snapshot for 30 days.
- Backup processes use one worker, maximum niceness, idle I/O scheduling, and
  constrained container CPU. Application recording and upload work remains the
  priority.
- R2 lifecycle rules abort incomplete multipart uploads under both repository
  prefixes after seven days. pgBackRest and restic own object expiry because
  blind object deletion would corrupt their repository metadata.

## Deployment

Build the PostgreSQL image on the production Docker daemon and push it into the
VPS-local registry:

```sh
docker -H ssh://root@157.90.155.63 build \
  --file ops/postgresql/Dockerfile \
  --tag 127.0.0.1:5555/sillage-postgres:17.10-pgbackrest-2.59.1 .
docker -H ssh://root@157.90.155.63 push \
  127.0.0.1:5555/sillage-postgres:17.10-pgbackrest-2.59.1
```

Upgrade PostgreSQL, create the pgBackRest stanza, and take the first full
backup before enabling recurring units:

```sh
bin/kamal accessory remove postgres
bin/kamal accessory boot postgres
bin/kamal accessory exec postgres \
  "runuser -u postgres -- pgbackrest --stanza=sillage stanza-create"
bin/kamal accessory exec postgres \
  "runuser -u postgres -- pgbackrest --stanza=sillage check"
bin/kamal accessory exec postgres \
  "runuser -u postgres -- pgbackrest --stanza=sillage --type=full backup"
PRODUCTION_OPERATIONS_CONFIRM=INSTALL_AND_ENABLE \
  ruby script/install_production_operations
```

Deploy the application with `BACKUPS_ENABLED=true` and
`MONITORING_ENABLED=true` only after the first backups pass.

## Routine checks

```sh
curl --fail https://sillage.exopter.com/ready
bin/kamal accessory exec postgres \
  "pgbackrest --stanza=sillage info"
ssh -i ~/.ssh/kamal_deploy root@157.90.155.63 \
  "systemctl list-timers 'sillage-*'"
ssh -i ~/.ssh/kamal_deploy root@157.90.155.63 \
  "journalctl --since today -u 'sillage-*'"
```

The readiness endpoint must report healthy PostgreSQL, Solid Queue worker,
dispatcher and supervisor heartbeats, and writable Active Storage. The
PostgreSQL monitor fails when the newest archived WAL is older than 20 minutes,
an archive failure is unresolved, or the latest full backup is older than 26
hours.

## PostgreSQL restore drill

Never restore over the production volume during a drill. Create a disposable
volume and use the same pinned PostgreSQL image and root-only environment file:

```sh
set -a
. /etc/sillage/operations.env
set +a
docker volume create sillage_postgresql_restore_drill
docker run --rm --entrypoint sh \
  --volume sillage_postgresql_restore_drill:/var/lib/postgresql/data \
  127.0.0.1:5555/sillage-postgres:17.10-pgbackrest-2.59.1 \
  -c "chown -R postgres:postgres /var/lib/postgresql/data"
docker run --rm --user 999:999 \
  --env-file /etc/sillage/operations.env \
  --env PGBACKREST_REPO1_TYPE=s3 \
  --env PGBACKREST_REPO1_S3_BUCKET=sillage-backups \
  --env PGBACKREST_REPO1_S3_ENDPOINT=6c9e9db0ce6bd48d48c0c60191f3cc65.r2.cloudflarestorage.com \
  --env PGBACKREST_REPO1_S3_REGION=auto \
  --env PGBACKREST_REPO1_S3_URI_STYLE=path \
  --env PGBACKREST_REPO1_S3_KEY="$R2_ACCESS_KEY_ID" \
  --env PGBACKREST_REPO1_S3_KEY_SECRET="$R2_SECRET_ACCESS_KEY" \
  --env PGBACKREST_REPO1_CIPHER_PASS="$PGBACKREST_REPOSITORY_PASSWORD" \
  --volume sillage_postgresql_restore_drill:/var/lib/postgresql/data \
  127.0.0.1:5555/sillage-postgres:17.10-pgbackrest-2.59.1 \
  pgbackrest --stanza=sillage --type=immediate restore
```

Start that volume without publishing a port and outside the Kamal network.
The recovery container still needs outbound DNS/network access to R2 and the
same `PGBACKREST_REPO1_*` variables so PostgreSQL can retrieve the required
WAL. Compare table counts and application invariants. Remove only the
disposable container and volume after verification.

## Active Storage restore drill

Restore into a disposable volume, never into `sillage_storage`:

```sh
set -a
. /etc/sillage/operations.env
set +a
docker volume create sillage_storage_restore_drill
docker run --rm --env-file /etc/sillage/operations.env \
  --env AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  --env AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  --env RESTIC_PASSWORD="$RESTIC_REPOSITORY_PASSWORD" \
  --env RESTIC_REPOSITORY="s3:https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BACKUP_BUCKET}/restic/active-storage" \
  --volume sillage_storage_restore_drill:/restore \
  restic/restic:0.18.0@sha256:28f29bcc3d38a061e09f825600244cf9854f09dd59443e9cd1dfa038c22b43d2 \
  restore latest --target /restore
```

Compare the restored file count and byte total with the production volume,
then remove the disposable restore volume.

## Disaster recovery

1. Provision Docker and Kamal on the replacement host.
2. Recreate the PostgreSQL and Active Storage volumes with their original
   names.
3. Restore PostgreSQL with pgBackRest to the required point in time.
4. Restore the latest Active Storage snapshot with restic.
5. Boot PostgreSQL, deploy Sillage, and verify `/ready` before routing traffic.
6. Confirm all four Healthchecks.io checks receive fresh successful pings.
