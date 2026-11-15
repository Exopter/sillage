# Project Instructions

Follow the [Exopter workspace instructions](../AGENTS.md), including the shared
performance, documentation and project-file rules.

- Work 100% in English for documentation, code comments, UI copy, tests,
  fixtures, commit messages, PR text, issue text, and operational notes.
- Keep business, product, architecture, design, requirements, contract,
  pricing, and roadmap documentation in Notion Engineering.
- Keep repository documentation limited to concise technical READMEs,
  executable component contracts, and implementation-coupled runbooks.
- Follow the shared [design-system authoring rules](../design_system/AGENTS.md).
  Stylesheets are generated exports of `templates/rails/stylesheets.json`;
  edit their shared sources and run `script/sync_design_system_tokens --write`.
- Keep Kamal configured through `.env.deploy.local`, loadable by global
  `kamal`, `bin/kamal`, and `bundle exec kamal`.
- Run software validation locally with `bin/ci` under the shared scope and
  execution rules.

## Windows development

- Follow the Compose Watch workflow in [README.md](README.md#windows-with-docker-compose-watch).
- Keep editable sources in the Windows checkout. Use `script/dev.ps1` for Rails
  generators, migrations, dependency updates and validation so generated files
  return directly to that checkout. Application-container edits are disposable.
- Keep local Docker development configuration in `compose.dev.yml` and
  `Dockerfile.dev`; production configuration remains separate.
