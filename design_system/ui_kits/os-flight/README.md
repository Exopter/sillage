# Exopter OS · Flight — UI kit

The **operations workbench** interpretation of OS Flight: a left-rail shell
(Flight / Atlas / Hangar / Signal / Forge / Core) with a Flight room that holds
**Logbook**, **Flight prep**, **Replay**, and **HUD** sub-tabs. Built entirely on
the Exopter design-system components and tokens.

## Run

Open `index.html`. It links:
- `../../styles.css` — the design-system tokens.
- `../../_ds_bundle.js` — the compiled components (SegmentedControl, IconButton, Badge, …).

Component files are siblings: `Shell.jsx`, `Logbook.jsx`, `Replay.jsx`,
`FlightPrep.jsx`, `Hud.jsx`, `icons.jsx`.

## Screens

| Sub-tab | What it shows |
| --- | --- |
| **Logbook** | Jump list; click a card to open Replay. |
| **Flight prep** | Pre-flight readiness checks. |
| **Replay** | 3D trajectory (SVG) + scrubber/play, analysis. |
| **HUD** | Pilot display preview. |

The non-Flight rooms (Atlas / Hangar / Signal / Forge / Core) render a labelled
placeholder — not built in this kit.

## Archive

- `_codebase-faithful/` holds the codebase-faithful recreation that mirrored the
  real Rails app (`dashboard`, `jumps`, `flight_imports` routes, verbatim
  `application.css`). Kept for reference; **this** workbench mockup is the active kit.
