# Project Instructions

- Always prioritize execution speed, responsiveness and throughput over lower
  memory usage across Exopter projects. Do not accept a slowdown solely to save
  RAM; use measurements to evaluate performance tradeoffs.
- Work 100% in English for documentation, code comments, UI copy, tests,
  fixtures, commit messages, PR text, issue text, and operational notes.
- Keep business, product, architecture, design, requirements, contract,
  pricing, and roadmap documentation in Notion Engineering.
- Keep repository documentation limited to concise technical READMEs,
  executable component contracts, and implementation-coupled runbooks.
- Use the shared Exopter design system for every product screen. Evolve shared
  tokens or components before adding a visual pattern, and record the design
  decision in Notion.
- Keep Kamal configured through `.env.deploy.local`, loadable by global
  `kamal`, `bin/kamal`, and `bundle exec kamal`.
- Run validation locally with `bin/ci`. Do not
  add or enable hosted CI unless explicitly requested by the user.
