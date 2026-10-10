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

## Documentation maintenance

- Write documentation in English. Keep Notion Engineering as the source of
  truth for product, architecture, design, requirements and roadmap content;
  local Markdown stores agent guidance and implementation-coupled material.
- Keep main pages concise: current purpose, selected configuration, operating
  rules, actual status, open decisions and links to controlled detail.
- Update the existing canonical page instead of appending chronological
  updates, repeating decisions or creating competing sources of truth.
- Before changing a baseline, reconcile recent relevant Exopter chats with
  current code, configuration, hardware artifacts and dated evidence. A newer
  statement alone does not prove implementation or qualification.
- Remove obsolete instructions, superseded alternatives and resolved issues
  from current guidance. Retain useful historical material only in clearly
  labelled reference subpages, with a link to the current baseline.
- Put detailed tests, measurements, logs, review findings and release history
  in dedicated dated subpages. Keep only their conclusion, scope, remaining
  limits and a link on the main page. Preserve raw evidence and source files.
- Distinguish proposed, implemented locally, deployed, bench-tested and
  physically qualified states. Record the relevant hardware, firmware,
  configuration and date; never generalize a test beyond its measured scope.
- Keep POC, current engineering design and future versions separate. Do not
  present an exploratory option, display correction or successful static test
  as a selected design, repaired calibration or flight qualification.
- Preserve useful page identities, attachments and traceability when moving
  content. After structural edits, read pages back and verify child pages,
  links, retained evidence and consistency across related documentation.
