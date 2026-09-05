# Sillage Rails application

Rails 8 application using ERB, Turbo, Stimulus, PostgreSQL, Active Storage, and
Solid Queue.

## Setup

```sh
bin/setup
bin/dev
```

`bin/setup` starts the pinned PostgreSQL container from `compose.yml` unless
`POSTGRES_HOST` points to an existing server.

Rails commands load ignored local runtime values from `.env.local`. If
`CESIUM_ION_TOKEN` is not already supplied there or by the shell, local startup
falls back to that browser-safe value from `.env.deploy.local`; other deployment
secrets are not imported into the application process.

Open `http://localhost:3000`.

Cesium's pinned npm distribution is served from `/vendor/cesium/<version>/`.
`bin/setup` and the Docker build copy its browser assets and license locally;
run `npm ci && npm run assets:prepare` to refresh them after a dependency update.
The 3D flight trajectory works without an ion token. Terrain, imagery, and
buildings load independently when configured; unavailable map data leaves the
3D viewer usable. A native 2D profile handles engine/WebGL initialization failure.

## Validation

```sh
bin/ci
```

The suite checks Ruby style, canonical design-system synchronization,
design-system usage, unused CSS selectors, the documentation boundary,
JavaScript workers, dependency security, Rails tests, and seeds.

## Design implementation

- Shared design assets: [Exopter/design-system](https://github.com/Exopter/design-system)
- Canonical tokens: `../design_system/tokens/exopter-tokens.css`
- Rails consumer copy: `app/assets/stylesheets/exopter_design_system.css`

Check or refresh the byte-for-byte consumer copy from a sibling checkout:

```sh
ruby script/sync_design_system_tokens --check
ruby script/sync_design_system_tokens --write
```

- Shared application components: `app/assets/stylesheets/application.css`

Design decisions and governance live in the
[Exopter Design System in Notion](https://app.notion.com/p/3abe497e504f81c8a557e1f1a26e09ae).

## Configuration

Use `.env.deploy.local.example` as the repository-safe reference for deployment
variables. Keep real secrets out of Git.

Kamal is configured in `config/deploy.yml`. Copy
`.env.deploy.local.example` to `.env.deploy.local`, then use `bin/kamal` for
deployment commands from the application root.

Production backup, monitoring, restore, and recovery procedures are in
[`RUNBOOK_OPERATIONS.md`](RUNBOOK_OPERATIONS.md).

Imported flights with a valid GPS landing point are reverse geocoded through a
configurable Nominatim-compatible endpoints. A named aerodrome within 3 km is
preferred before falling back to the address at the landing point.
`NOMINATIM_URL`, `NOMINATIM_SEARCH_URL`, `NOMINATIM_USER_AGENT`, and
`NOMINATIM_LANGUAGE` override the safe defaults. The dedicated geocoding worker
is single-threaded and results are cached before being persisted on the flight.

## Recording imports

Imports use the dedicated `imports` queue. USB synchronization first stores a
SHA-256-verified source and a queued receipt; the browser polls that receipt and
acknowledges the recorder only after successful validation/import. Wi-Fi
finalization validates and imports on the same queue. Failed imports retain their
source attachments and roll back partial flight data.

There are no application quotas on recording size, sample count, source file
count, or expanded ZIP volume. Format and integrity checks remain: CRC/SHA-256,
manifest sizes, CSV lines of at most 16 KiB, V2 metadata of at most 256 lines/64 KiB,
and ZIP paths of at most 1 KiB. ZIP64 and multi-volume archives are unsupported.

Decoding uses 64 KiB reads, disk-backed temporary JSON sample buffers, a paged
sparse sequence bitmap, and 1,000-row inserts. GPS and pressure analysis still
loads the relevant samples into memory; other sensor streams contribute only
their timeline endpoints. Temporary files are removed on success and failure.
Memory and temporary storage usage grow with the recording and worker concurrency.
