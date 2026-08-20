# PostgreSQL cutover runbook

This runbook is intentionally executable only during an approved maintenance
window. Preparing or validating the code does not authorize a production
migration, deployment, restart, database write, or SQLite deletion.

## Immutable artifacts

Build and retain two image references before the maintenance window:

- the final Sillage image, which contains PostgreSQL support only;
- the temporary migration image built from
  `script/sqlite_to_postgresql/Dockerfile`.

The migration image requires all four of these variables and otherwise exits:

```text
SOURCE_SQLITE_PATH
TARGET_DATABASE_URL
MIGRATION_MANIFEST_PATH
MIGRATION_CONFIRM=IMPORT_SQLITE_INTO_EMPTY_POSTGRESQL
```

It refuses an administrative or nonempty PostgreSQL target. Its source must be
a consolidated SQLite `.backup` without WAL or SHM sidecars. It opens that
source read-only, runs `PRAGMA quick_check`, uses PostgreSQL `COPY`, resets
sequences, validates foreign keys and per-flight sample counts, then creates a
non-overwritable JSON manifest.

Only `production.sqlite3` contains durable application data and is imported.
The cache and cable databases are ephemeral and deliberately start empty in
PostgreSQL. The queue database is not imported: the cutover gate requires all
work that must survive to be completed before shutdown. All Solid tables then
live in the same PostgreSQL database as the application tables.

## Rehearsal gate

1. Create a read-only SQLite snapshot with the old image's `sqlite3` CLI and
   its `.backup` command, then confirm that the snapshot has no `-wal` or
   `-shm` sidecar.
2. Load the final Rails schema into a disposable PostgreSQL database.
3. Run the temporary migration image against the snapshot.
4. Run `postgresql_migration:verify` with the generated manifest and the
   Active Storage volume mounted read-only.
5. Dump the disposable database, restore it into a second database, and run
   the same verification again.
6. Record the total duration. Reserve twice that duration plus 15 minutes for
   the production maintenance window.

Any failed check invalidates the rehearsal. Recreate an empty target instead
of resuming a partial import.

## Production cutover

Do not start these steps without a new, explicit operator approval.

1. Confirm that no FDR Wi-Fi upload is finalizing and that Solid Queue has no
   ready, claimed, scheduled, or blocked execution that must be preserved.
2. Stop the web and queue processes. Keep the application unavailable until
   the irreversible gate below has passed.
3. Use the old image's `sqlite3` CLI and `.backup` command to create a closed,
   consolidated snapshot of `production.sqlite3`. Confirm that the snapshot
   has no `-wal` or `-shm` sidecar, run `PRAGMA quick_check`, and record its
   SHA-256 digest. Preserve the four closed production SQLite databases until
   the irreversible gate.
4. Boot the `sillage-postgres` Kamal accessory, verify `pg_isready`, create the
   empty target, and load the final Rails schema.
5. Run the migration image once with the exact confirmation phrase.
6. Deploy the final PostgreSQL-only Sillage image.
7. Verify `/up`, `/ready`, authentication, flights, attachments, recorder
   commands, five-second heartbeats, and a complete Wi-Fi upload plus import.
8. Create a custom-format `pg_dump` outside the VPS, restore it into a second
   PostgreSQL database, and run:

   ```sh
   MIGRATION_MANIFEST_PATH=/secure/manifest.json \
   POSTGRESQL_RESTORE_VERIFICATION=/secure/postgresql-restore-verified.json \
   POSTGRESQL_RESTORE_CONFIRM=VERIFY_RESTORED_POSTGRESQL_DUMP \
   bin/rails postgresql_migration:verify
   ```

## Irreversible SQLite removal

The application remains closed until both the live database and the restored
`pg_dump` pass all checks. Before that gate, rollback uses the untouched SQLite
source and previous image.

After the gate, use `script/remove_sqlite_after_postgresql_restore` with the
generated verification file, `SQLITE_SNAPSHOT_PATH` pointing to the exact
imported snapshot, and the confirmation phrase
`DELETE_ALL_VERIFIED_SQLITE_ARTIFACTS`. The script rechecks the snapshot digest
before removing it and the four production databases. Then:

1. remove the temporary snapshot and every other SQLite copy;
2. remove the migration container and image;
3. remove old Sillage containers and images that contain SQLite;
4. delete `script/sqlite_to_postgresql`, the cleanup script, and this temporary
   cutover runbook in the final cleanup commit;
5. delete the disposable restore database;
6. reopen Sillage.

After SQLite removal, recovery uses only PostgreSQL and the verified
custom-format dump. Do not reopen traffic before this change of rollback
boundary is accepted.
