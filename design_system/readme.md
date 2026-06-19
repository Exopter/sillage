# Exopter Design System

> Exopter develops advanced personal **rigid-wing flight systems** — aerospace engineering, embedded sensing, pilot assistance, and flight-data intelligence. The **Sillage** operating suite supports the full flight lifecycle: preparation, live in-flight guidance, recording, replay, analysis, maintenance, and continuous improvement.

This design system should feel like **a piece of flight-test equipment**: matte, precise, physical, safety-aware, and quietly ambitious. Not a generic aviation app, not a drone brand, not futuristic decoration.

---

## Sources

This system was built from materials provided by the team. Not all are present in this project — listed here so a reader with access can trace decisions.

- **`uploads/design-system.md`** — the authoritative Exopter design brief (color, type, components, HUD rules, voice, product architecture). The single source of truth for everything below. *(Present in `uploads/`.)*
- **Wing reference photo** — matte-black rigid wing on a grass field, white `EXOPTER` wordmark. Saved at `assets/exopter-wing-reference.jpeg`. *(Present.)*
- **Rails app** (`sillage/web/`, **attached**) — the real Sillage Flight Lab. `app/assets/stylesheets/exopter_design_system.css` is the canonical token file (mirrored verbatim into `tokens/exopter-tokens.css`); `application.css` holds the component classes + `--ds-*` bridge (copied into `ui_kits/sillage-flight/sillage.css`); `/devreference/design-system` is the app's own reference page; views under `app/views/` (dashboard, jumps, flight_imports); copy in `config/locales/en.yml`.
- **`docs/` program files** (`sillage/docs/`, **attached**) — EPW/GLD specs, HUD & FDR requirements, Singapore pricing quotes, roadmap, OpenProject agent-workflow README, COC contract. *(Not yet mined into the system — see caveats.)*

### Deep-tech brand references (supplied by the user)

For the **public/brand** surface, the team pointed to deep-tech industrial sites (SpaceX, Anduril, Saronic, Varda, Figure, Apptronik, Shield AI). Distilled direction: **carbon-black backgrounds, huge real product visuals, very little text, massive typography, black/white/grey + a single accent, factual tone, subtle understated animation, blueprints/3D, lots of empty space — Apple-like but more industrial.** This matches the brief's own "Public Brand Page Direction" and is applied in the brand UI kit.

---

## Product Architecture (use these names deliberately)

| Name | Role |
| --- | --- |
| **Exopter** | Master brand, company, vehicle program, public identity. |
| **Exowing** | Wing-system name (GLD, EPW, JPW, prototypes, contracts). |
| **Sillage** | The operating software suite — an avionics workbench. |
| **GLD** | Glider Wing System — unpowered rigid-wing validation stage (the first validated stage). |
| **EPW / EDF** | Electric-Powered Wings / electric ducted fan mode. Adds power, battery, autonomy, ground station. |
| **JPW / JET** | Jet-powered roadmap extension. Use sparingly until requirements mature. |

**What actually ships today: Sillage Flight Lab.** The real app is a **FlySight jump-trace workshop** — import a flight trace, replay the 3D trajectory, sync a video, and analyse height/speed, ground track, performance, IMU dynamics, and power. Its surfaces: Dashboard ("Trajectory workshop"), Jumps (logbook), Jump (3D replay + charts), Import. The broader **Sillage room family** is *planned* per the brief, not yet built: **Atlas** (maps, terrain, route), **Hangar** (fleet, hardware, spares), **Signal** (telemetry, comms, ground station), **Forge** (agent workflows, OpenProject, docs), **Core** (auth, audit, storage). Treat Flight Lab as the source of truth; the rest as roadmap.

---

## CONTENT FUNDAMENTALS

How Exopter writes.

- **Concise operational English.** Direct, calm, competent. The reader is a pilot, engineer, operator, or reviewer making the next safe decision.
- **Voice: "you" (operational) and the system as a quiet instrument.** Not first-person marketing ("we revolutionize…"). Instructions address the operator: "Verify GLD flight readiness."
- **Preferred verbs:** load, prepare, verify, arm, disarm, record, replay, compare, inspect, approve, export, sync, train, certify. Reach for these before generic ones ("see", "manage", "get started").
- **Specific, never vague.** Name the mode, hardware, pilot, sensor, test status. "Replay T0 exit and compare glide ratio" beats "view your flight data".
- **Honest about risk and maturity.** Never hide a safety gate or uncertainty. "Sensor fault: do not rely on airspeed." State what is unknown as "Unknown" / "No data" — don't fill blanks with optimism.
- **Casing.** Sentence case for prose and most UI. **UPPERCASE** (with `--ls-label` tracking, mono) reserved for compact technical tokens: `GLD`, `EDF`, `JET`, `READY`, `FAULT`, `ARMED`, `T0+6`. Title Case for proper product names (Sillage Flight, Sillage Atlas).
- **Numerals are data.** Tabular figures for speed, altitude, glide, distance, durations, dates, prices. Short unit labels: `km/h`, `m`, `°C`, `kW`.
- **No emoji.** No hype adjectives. **Banned:** "revolutionary", "superhuman", "ultimate freedom", "fly like a hero", "unlock the future of personal flight", vague AI/productivity claims.
- **Contract/authority surfaces stay plain.** No marketing language in specs, checklists, pricing, or acceptance docs. Always carry source, owner, state, date.

**Examples (good):** "Verify GLD flight readiness." · "Replay T0 exit and compare glide ratio." · "Sensor fault: do not rely on airspeed." · "Parachute armed. Opening set 1500 m." **Avoid:** "Unlock the future of personal flight." · "Experience superhuman freedom."

---

## VISUAL FOUNDATIONS

**Palette.** Two bases — **carbon** (`#070B0D`→`#182426`) and **vapor** (`#F5F8F6`/`#FFFFFF`) — carry almost all surface area. Signal colors **annotate** information and never become large decorative fills: **sky** `#2EA8FF` (routes, links, navigation), **aqua** `#2FD6C6` (live telemetry, selected, active traces), **HUD green** `#8CFF4D` (*reserved* — pilot display, ready/safe flight signals only, never generic buttons), **field green** `#4F7B4E` (ground, readiness, training, environment — quieter than HUD green), **amber** `#F2A23A` (caution, pending), **red** `#E63B35` (fault, abort, destructive). Never rely on color alone — always pair with label, icon, pattern, or position.

**Color vibe of imagery.** Real, cool-neutral, daylight-honest — matte carbon surfaces with readable white markings, open sky, grass field as *context not wallpaper*. No warm filters, no heavy grain, no sci-fi teal-orange grading. The object is the proof: show inspectable hardware (hooks, seats, FDR, probes, batteries), not dark cropped silhouettes.

**Type.** Inter (UI/headings), IBM Plex Mono (instrument data, labels, logs). Stable **rem** sizes — never viewport-scaled type. Compact interface headings; large display type reserved for public brand pages and major dashboards. Tabular numerals everywhere data appears. Uppercase mono for compact status tokens.

**Spacing & shape.** 4px grid. **8px** standard radius (panels, inputs, buttons, cards); **4px** compact radius (instrument slots, tags, table cells, status chips); fully round **only** when the shape *is* the control (play, reset, target, physical toggle). Avoid pill-heavy controls — prefer compact icon, switch, segmented, or instrument-style controls.

**Borders & rules.** 1px technical rules (`--border-rule`). Stronger 2px borders signal active and warning states. Lines are structural, not decorative.

**Cards.** Light surface: white fill, 1px `--border-rule`, 8px radius, **low** functional shadow (`--shadow-sm`/`--shadow`). Dark surface: `--ex-carbon-900` fill, 1px `--ex-carbon-700` border, no glow. **Never nest cards inside cards.** Use cards only for repeated items and framed tools.

**Elevation.** Low, functional shadows on light UI. **No floating glassmorphism**, no big blurred drop shadows. Sunken instrument slots may use a subtle inner shadow (`--shadow-inset`).

**Backgrounds.** Flat carbon or vapor — **no decorative gradients**. Full-width **dark instrument bands** for trajectory, HUD, map, and replay surfaces. A faint technical grid / blueprint quadrillage is acceptable on dark brand sections (subtle, structural). Public hero = the real wing on carbon, not an abstract fill.

**Transparency & blur.** Used sparingly and functionally: a dark overlay to keep a wordmark legible over scenery; a HUD must **not** use broad opaque panels that block the environment view. No frosted-glass UI chrome.

**Motion.** Brief, directional, purposeful. Use it where it *carries meaning*: replay scrubbers, telemetry traces drawing in, progressive checklist completion, altitude digits moving vertically, aircraft/path movement. Easing `--ease-out` for entrances, `~120–280ms`. No infinite decorative loops, no bounce. Brand pages: subtle, understated reveals only. Respect `prefers-reduced-motion`.

**Hover / press states.** Light surface hover = step to `--surface-hover` (vapor-100) or a 1-step-darker fill; dark surface hover = step up to `--ex-carbon-800`. Press = brief, slight darken (no large scale change); momentary controls may shrink \~1px. Focus = 2px `--focus-ring` (sky) outline/ring, always visible for keyboard.

**Fail-safe rule (HUD/critical).** Failure goes **carbon black**, never a white flash. Safe blank state with a recovery path outside the HUD context.

---

## ICONOGRAPHY

The real Sillage app ships **no icon library** — its few controls are **pure-CSS glyphs** (the play/pause triangle `.play-toggle-icon`, the camera-reset `.camera-reset-icon`, and the CSS-constructed `.brand-mark`), and the brand wordmark uses the three speed-bars (≡). For broader product work (slides, mocks, new screens) this system standardizes on **[Lucide](https://lucide.dev)** — an open, MIT-licensed line-icon set with a consistent **1.5–2px stroke**, `24×24` grid, rounded caps — whose precise, utilitarian stroke matches the flight-test-equipment feel. **Substitution flag:** Lucide is *additive* (the app itself doesn't use it); keep the app's CSS glyphs when recreating real screens, and reach for Lucide only for new surfaces. No emoji, no Unicode pictographs.

- **Format:** inline SVG (stroke icons), loaded from the Lucide CDN in cards and UI kits (`https://unpkg.com/lucide@latest`). Single-color via `currentColor` so icons inherit text/state color.
- **Sizing:** 16px (compact/inline), 18–20px (default controls), 24px (nav, headers). Keep stroke weight visually consistent — don't mix fill and stroke styles in one view.
- **Color:** icons take the color of their context (text or state). A fault icon is `--ex-red-600`; a ready check is field/HUD green. Never color an icon decoratively.
- **Mode/status glyphs:** prefer plain status dots + uppercase mono labels (`READY`, `FAULT`) over ornate iconography for safety states.
- **No emoji. No Unicode pictographs** as UI icons. The brand wordmark's three speed-bars (≡) may be used as a quiet section/brand marker; the aerofoil mark (`assets/mark-aerofoil.svg`) is for diagrams only, never as a primary logo.

Common Lucide glyphs in use: `gauge`, `activity`, `plane`, `route`, `map`, `radio`, `battery`, `thermometer`, `check`, `circle-check`, `triangle-alert`, `octagon-x`, `play`, `pause`, `rotate-ccw`, `download`, `upload`, `clipboard-check`, `shield`, `wrench`, `crosshair`, `chevron-down`.

---

## Brand marks (placeholders — NON-FINAL)

The physical reference is the white `EXOPTER` wordmark on matte carbon: uppercase geometric, forward stance, **three horizontal speed bars before the E** (reads `≡XOPTER`), with a compact `EXO` mark on fins.

- `assets/logo-wordmark.svg` — full wordmark, `currentColor` (inverts on carbon/vapor).
- `assets/logo-exo.svg` — compact EXO mark.
- `assets/app-icon.svg` — three bars in vapor on a carbon tile (favicon/app).
- `assets/mark-aerofoil.svg` — airfoil section for diagrams only.

**Rules:** do not redraw the official wordmark for production from the photo — these are mockup placeholders, mark as non-final. Preserve strong contrast (white/ vapor on carbon, carbon on light technical bg). Keep clearspace ≥ the height of the `E` bars on all sides. Don't place over busy scenery without a dark overlay or clean wing surface. **Produce real vector marks from original artwork before any production use.**

---

## INDEX / MANIFEST

Root files:

- **`styles.css`** — global entry point (consumers link this one). `@import` list only.
- **`readme.md`** — this guide.
- **`SKILL.md`** — Agent-Skills-compatible entry for downloadable use.

`tokens/` — design tokens (all reachable from `styles.css`):

- `fonts.css` (webfont `@import`), `colors.css` (carbon/vapor/signal + semantic aliases + `.ex-dark` scope), `typography.css`, `spacing.css` (space, radius, shadow, motion).

`guidelines/` — foundation specimen cards (Design System tab): color palettes, type specimens, spacing/radius/shadow, state legend, brand wordmark.

`components/` — reusable React primitives (see each `*.prompt.md`):

- `forms/` — Button, IconButton, Input, Select, Switch, SegmentedControl
- `feedback/` — Badge, StatusDot, Toast
- `data/` — MetricTile, Card, ReadinessStrip, ChecklistRow

`ui_kits/` — full-screen product recreations:

- `sillage-flight/` — the Sillage Flight workbench (logbook, replay, prep, HUD).
- `exopter-brand/` — the public/brand page (deep-tech, object-led).

`assets/` — wing photo, placeholder logo marks, aerofoil mark.

> **Caveat:** the Rails codebase (`sillage/web/`) is now attached, so tokens
> (`tokens/exopter-tokens.css`) and the Sillage Flight Lab UI kit
> (`ui_kits/sillage-flight/`, using the app's own `application.css`) are faithful
> recreations from source. Still substitutions: **Aptos** (brand sans) falls back
> to **Inter** via Google Fonts until the licensed file is supplied; **Lucide** is
> an additive icon set for new surfaces (the app itself uses CSS glyphs); the
> trajectory/charts are SVG stand-ins for the app's Cesium/Chart.js canvases.
> Logo marks remain non-final placeholders. The `sillage/docs/` program files are
> attached but **not yet mined** into specimen content. See CAVEATS at handoff.
