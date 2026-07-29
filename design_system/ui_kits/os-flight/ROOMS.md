# Sillage operational rooms

This prototype keeps four rooms in the primary operator rail, ordered Flights, Hangar, Atlas, then a separated Signal entry. Each room owns a different operational question and a different source of truth.

| Room | Operator question | Owns | Does not own |
| --- | --- | --- | --- |
| Flights | What are we preparing, and what happened? | Flight lifecycle, preparation, logbook, sealed flight record, replay, analysis, notes | Reusable geographic data, serialized hardware, live radio acquisition |
| Atlas | Where can we operate and land? | Landing zones, map context, practical information, and operator notes | Live telemetry, flight record, maintenance state |
| Hangar | Which aircraft and physical configuration are flying, and are they serviceable? | Fleet aircraft, time-bounded installations, movable assemblies, serialized parts, configuration, cycles, anomalies, maintenance, readiness | Telemetry visualization, map data, flight analysis |
| Signal | What is happening now, and can the data be trusted? | Live radio session, reduced telemetry, stream validity, link health, operator events, local/cloud synchronization state | Authoritative black-box storage, long-term flight record, maintenance disposition |

## Cross-room handoffs

- A flight preparation selects one landing zone from Atlas and one aircraft configuration from Hangar.
- A manually created Flight starts in Preparation and can receive FlySight or ExoFDR data from removable media.
- A direct import creates a Flight after the operator confirms or completes its aircraft and landing zone.
- Starting Signal from a prepared Flight attaches the live session to it automatically.
- Starting Signal without a selected prepared Flight creates one automatically. Detected aircraft and landing-zone context are filled; unresolved values remain `To complete` without blocking capture.
- Signal monitors the active flight and links landing-zone context back to Atlas.
- Signal links a sensor anomaly to the serialized part in Hangar.
- When the flight closes, its sealed record appears in Flights for replay and analysis.
- The local FDR recording remains authoritative. Signal can continue locally during a short Internet interruption and backfill the cloud stream after reconnection.

## Navigation simplification

- Forge and Core are removed from the primary operator rail.
- Forge remains an engineering workspace and should be exposed through a permissioned engineering entry point.
- Core remains administration and platform infrastructure and should be exposed through account or administration navigation.
- Replay is a state of a selected flight, not a permanent top-level tab.
- HUD configuration belongs to the flight preparation and equipment workflow; the preview can remain in Flights until a dedicated pilot-display workflow is justified.

## Current scope constraints

- The product is glider-only for the current horizon. No propulsion mode selector is shown.
- Atlas and Signal model a landing zone only. Waypoints, routes, target zones, and mission corridors are deferred.
- Signal exposes Live map, Instruments, and Charts as movable widgets on one coordinated canvas. Each widget has three explicit states: Enlarged, Mini, and Hidden; Hidden retains only the draggable header. There are no permanent view tabs.
- The live-session header combines flight context, Radio, Recorder, Cloud, presentation, event, and session controls in one compact row.
- Heading, airspeed, altitude, vertical speed, glide, and landing-zone distance live in one shared telemetry strip instead of being repeated inside Map and Instruments.
- Flight lifecycle is `Preparation → Live or SD import → Processing → Analysed or Review`.
- The Live map shows the aircraft, heading, and continuously extending flight path. It does not model waypoints or target zones.
- Hangar models `Fleet → Aircraft → Installation → Assembly → Subassembly → Part`. A serialized assembly can move between aircraft while preserving dated installation history. Standalone equipment, such as a FlySight installed in a wingsuit, uses the same installation history.
- Hangar exposes five working sections: Fleet, Assemblies, Parts, Functions, and Qualification. Qualification contains immutable Builds and their Test Runs.
- Atlas remains a simple landing-zone directory: list, map, practical information, and free-form notes. It does not own operational survey statuses or live-map actions.
