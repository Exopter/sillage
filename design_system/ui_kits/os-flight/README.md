# Sillage · Flight — UI kit

The **operations workbench** interpretation of Sillage Flight: a left-rail shell
(Flights / Hangar / Atlas, then separated Signal) with a Flights room that holds
**Flights**, **Flight prep**, **Replay**, and **HUD** states. Built entirely on
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
| **Flights** | Create a prepared Flight, import FlySight or ExoFDR data, start an attached Signal session, or open a completed Flight. |
| **Flight prep** | Pre-flight readiness checks. |
| **Replay** | 3D trajectory (SVG) + scrubber/play, analysis. |
| **HUD** | Pilot display preview. |

Atlas, Hangar, and Signal are interactive rooms in this kit. Signal combines
Live map, Instruments, and Charts in one live workspace; any panel can become
the primary view while the other two remain available as picture-in-picture
previews or reduced rails. A presentation mode fills the whole display for a
large monitor or projector. Hangar exposes the fleet and installed
configuration hierarchy plus Assemblies, Parts, Functions, Builds, and Test
Runs; Atlas is the landing-zone directory. The operator rail is ordered Flights,
Hangar, Atlas, then separated Signal. Signal can attach to a prepared Flight or
create one automatically from detected aircraft and landing-zone context. Forge
and Core remain outside the primary navigation.

## Archive

- `_codebase-faithful/` holds the codebase-faithful recreation that mirrored the
  real Rails app (`dashboard`, `jumps`, `flight_imports` routes, verbatim
  `application.css`). Kept for reference; **this** workbench mockup is the active kit.
