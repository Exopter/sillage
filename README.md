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

Open `http://localhost:3000`.

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
