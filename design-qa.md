# Sillage unified operations prototype — design QA

## Evidence

- Source visual truth:
  - `/Users/julien/.codex/generated_images/019fa7d5-91b3-7883-8ff5-196bdc748810/exec-cd50e880-4e24-46b3-aa4b-d671711df8de.png` — Live map direction.
  - `/Users/julien/.codex/generated_images/019fa7d5-91b3-7883-8ff5-196bdc748810/exec-0b33aa76-07ba-47ca-a700-d0f0d68eb7d2.png` — Instruments direction.
  - `/Users/julien/.codex/generated_images/019fa7d5-91b3-7883-8ff5-196bdc748810/exec-e16fad40-db31-4f74-b654-e2a12688feba.png` — Charts structure.
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/05-hangar-readiness.png` — previous Hangar screen used as the scoped-edit baseline.
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/06-atlas-landing-zones.png` — previous Atlas screen used as the scoped-edit baseline.
- Browser-rendered implementation screenshots:
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/16-signal-live-map-final.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/17-signal-instruments-final.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/18-signal-charts-final.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/11-signal-charts-cloud-delay.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/19-hangar-fleet-final.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/13-hangar-wingsuit-flysight.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/14-hangar-exowing.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/20-atlas-final.png`
- Combined comparison evidence:
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/qa-map-v2.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/qa-charts-dark.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/qa-hangar-fleet.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/qa-atlas-simple.png`

## Normalization

- CSS viewport: 1280 × 820 px, device scale factor 1.
- Implementation captures: 1280 × 820 px.
- Generated source captures: 1487 × 1058 px, center-cropped to the 1280 × 820 aspect ratio and resized for combined comparisons.
- Existing Hangar and Atlas baselines: 1280 × 820 px.
- Compact check: 900 × 820 px. Document and main scroll widths equal their client widths in Atlas, Signal Live map, and Signal Charts.
- States: live flight, cloud live, cloud reconnecting with local capture, three Hangar fleet selections, and selected Atlas landing zone.

## Required fidelity surfaces

- Fonts and typography: the existing Aptos and mono/data hierarchy is preserved. Labels and live values remain legible without clipping at both tested widths.
- Spacing and layout: Signal retains the source hierarchy of status band, large primary visualization, and inspection rail. Hangar uses an aircraft list plus configuration detail without crowding the 1280 px frame. Atlas keeps the list/map split while simplifying its lower information panel.
- Colors and tokens: Charts now uses the same carbon dark theme as Live map and Instruments. Aqua, HUD green, amber, and readiness colors use the existing Sillage tokens.
- Image quality and asset fidelity: the generated terrain asset keeps a stable wide crop. The live path is rendered as telemetry data, and the aircraft marker uses the existing Sillage icon system.
- Copy and content: `Data integrity` is renamed `Charts`; packet counts are replaced by `Cloud is 18 seconds behind`; no GLD/EDF/JET selector, waypoint, or target zone appears. Atlas has no survey status and no `Open live map` action.
- Information architecture: Hangar now exposes `Fleet → Aircraft → Installation → Assembly or equipment → Subassembly → Part`, including FDR-0012 in Pilatus F-GOCC, FlySight 2 in WS-TEST-02, and WING-0001 plus FDR-0014 in EXO-001.
- Interactions: all four rooms, all three Signal views, Internet interruption/recovery, event marking, landing-zone handoff, sensor-to-Hangar handoff, and all three fleet selections were exercised.
- Browser console: no runtime errors. The only warnings are the expected prototype-only Babel standalone precompile warnings.

## Comparison history

### Pass 1

- P1: Live map showed only a position dot and lost the aircraft, heading, and flight-path scan pattern from the selected source.
- P1: Data integrity was the only light Signal view and visually broke the ground-station workspace.
- P2: `12 packets queued` exposed an implementation count rather than an operator-understandable delay.
- P1: Hangar collapsed fleet identity and installed hardware into one active assembly, so it could not express a movable FDR, a FlySight in a wingsuit, or the two assemblies that make an Exowing.
- P2: Atlas included workflow statuses and a live-map action outside its simplified landing-zone-library role.
- Fixes: added a moving aircraft marker, heading, and extending path; introduced dark Charts; replaced packet counts with an 18-second cloud delay; redesigned Hangar around aircraft and installation history; reduced Atlas to the list, map, notes, and practical information.

### Pass 2

- P2: the aircraft label and Landing Zone marker competed in the first revised Live map capture.
- P2: Hangar's first summary said four assemblies even though one installed configuration is a standalone FlySight device.
- Fixes: moved the Landing Zone farther right and placed the aircraft telemetry label above its marker; renamed the summary to four installed configurations.
- Post-fix evidence: `16-signal-live-map-final.png`, `19-hangar-fleet-final.png`, and the combined comparison files listed above.

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- P3: the production Instruments integration should reproduce the full circular attitude display, calibrated tape ticks, and precise proportions of the selected first visual.
- P3: the production Charts integration should use real synchronized series, cursor inspection, zoom, and event annotation while preserving this dark composition.
- P3: production accessibility still needs keyboard, screen-reader, and exact contrast testing against real Rails components.

## Iteration: navigation, aircraft column, and complete Hangar workspace

### Evidence

- Source visual truth:
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/07-flights-logbook.png` — Flights baseline before the aircraft column and navigation reorder.
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/19-hangar-fleet-final.png` — accepted Hangar visual direction before the internal workspace extension.
- Browser-rendered implementation:
  - `21-flights-aircraft.png` — reordered navigation and aircraft identity in every flight row.
  - `22-hangar-fleet-workspace.png` — Fleet and installed configuration.
  - `24-hangar-assemblies.png`, `26-hangar-parts.png`, `28-hangar-functions.png`, `30-hangar-qualification.png` — the four additional Hangar work areas.
  - `23-hangar-add-aircraft.png`, `25-hangar-add-assembly.png`, `27-hangar-add-part.png`, `29-hangar-add-function.png`, `31-hangar-add-build.png`, `32-hangar-record-test.png`, `33-hangar-change-configuration.png` — focused drawer states.
  - `34-hangar-tablet-900.png` and `35-hangar-assemblies-tablet-900.png` — compact-width evidence.
  - All relative screenshot paths above are under `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/`.
- Combined full-view comparison evidence:
  - `qa-flights-aircraft-pair.png`
  - `qa-hangar-workspace-pair.png`

### Normalization and tested state

- Source and implementation captures are each 1280 × 820 px at CSS viewport 1280 × 820 and device scale factor 1; combined files are 2560 × 852 px including their labels. No density resampling was required.
- Compact checks used CSS viewport 900 × 820. `window.innerWidth`, `document.body.scrollWidth`, and `document.documentElement.scrollWidth` all returned 900 px in Fleet and Assemblies.
- States inspected: Flights Logbook; Fleet; Assemblies; Parts; Functions; Qualification; every create/register/install drawer; every success confirmation; Parts search and clear; desktop and compact layouts.
- Primary interactions tested: navigation order; aircraft selection; section switching; register aircraft; change configuration; create assembly; register part; create function; create build; record test run; Save/Done/Close; and Parts filtering.
- Browser console: no runtime errors. The only messages are the expected prototype-only Babel standalone precompile warnings.

### Required fidelity surfaces

- Fonts and typography: the accepted Aptos plus mono/data hierarchy, weights, letter spacing, and status-label treatment are preserved. The added aircraft column remains scannable; no identifier or status wraps in the final Assemblies capture.
- Spacing and layout rhythm: the new Hangar tabs sit inside the existing page hierarchy, drawers use a consistent 470 px desktop rail, and the 900 px breakpoint stacks detail panels without horizontal overflow.
- Colors and tokens: the existing carbon header, light operations workspace, aqua focus/selection, green readiness, amber attention, borders, radii, and shadows remain token-driven and consistent with the source.
- Image quality and asset fidelity: no new photographic or illustrative asset was required. Existing Exopter marks and the shared icon system are retained; no placeholder emoji, CSS illustration, or substitute logo was introduced.
- Copy and content: Flights names the aircraft explicitly. Hangar distinguishes durable Aircraft identity, dated Installations, reusable Assemblies, serialized Parts, controlled Functions, frozen Builds, and Test Runs in standalone operator language.
- Icons and affordances: shared plane, layer, settings, signal, close, check, and plus icons retain the established stroke family; active tabs, selected rows, drawer overlay, form focus, and success feedback are visible.
- Accessibility and responsiveness: forms expose labels, drawers use dialog semantics and named close actions, navigation and tabs use native buttons, focus styling is present, and neither tested viewport clips persistent controls.

### Comparison history

#### Pass 3

- P2: the first Assemblies implementation reused the Fleet 300 px master column, forcing assembly codes, descriptions, and states onto several lines and materially reducing scanability.
- Fix: introduced a dedicated `hangar-layout--assemblies` grid with a minimum 520 px list and 380 px detail panel while retaining the stacked 900 px breakpoint.

#### Pass 4

- Post-fix visual evidence: `24-hangar-assemblies.png` at 1280 × 820 and `35-hangar-assemblies-tablet-900.png` at 900 × 820.
- Result: identifiers, installation, part count, and state scan as stable columns at desktop; list and details stack cleanly at compact width. No actionable P0, P1, or P2 finding remains.

### Focused-region comparison

- Focused drawer screenshots were reviewed because form labels, defaults, select truncation, help text, and footer actions are too small in the full-view pair. All primary fields and actions are legible; the Build assembly select uses normal native-select truncation without hiding the selected code.

### Follow-up polish

- P3: production validation should add destructive/removal confirmations and field-level validation once the Rails write paths are wired.
- P3: exact keyboard traversal and screen-reader announcements should be tested again in the production component stack.

## Iteration: Flight preparation, SD imports, and Signal attachment

### Evidence

- Source visual truth:
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/21-flights-aircraft.png` — accepted Flights table language before lifecycle controls.
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/16-signal-live-map-final.png` — accepted Signal live-session composition.
- Browser-rendered implementation:
  - `36-flights-preparation-lifecycle.png` — Preparation rows, Landing zone, source, lifecycle, and actions.
  - `37-flights-create.png` — manual Flight creation.
  - `38-flights-direct-import.png` — direct FlySight / ExoFDR import with detected context and operator confirmation.
  - `39-flight-preparation-detail.png` — prepared Flight actions for import and Signal.
  - `40-signal-linked-flight.png` — Signal session attached to an existing prepared Flight.
  - `41-signal-session-home.png` — Signal entry state with prepared Flights and automatic-creation rule.
  - `42-signal-attach-existing.png` and `43-signal-create-automatic.png` — both session-start choices.
  - `44-signal-home-tablet.png` — compact Signal entry state.
  - All relative screenshot paths above are under `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/`.
- Combined full-view comparison evidence:
  - `qa-flights-lifecycle-pair.png`
  - `qa-signal-linked-pair.png`

### Normalization and tested state

- Source and implementation captures are each 1280 × 820 px at CSS viewport 1280 × 820 and device scale factor 1. Combined comparisons are 2560 × 852 px including labels; no resampling was required.
- Compact verification used CSS viewport 900 × 820. Flights and Signal each returned 900 px for `window.innerWidth`, `document.body.scrollWidth`, and `document.documentElement.scrollWidth`.
- States inspected: base Flights list, Create Flight, creation success, direct ExoFDR import, FlySight source selection, import success, prepared Flight detail, attached live Signal, no-session Signal, attach-existing choice, automatic-creation choice, automatically created live Flight, and compact layouts.
- Primary interactions tested: create in Preparation; switch import source; direct import with aircraft and landing-zone confirmation; attach import to a prepared Flight; start Signal from a prepared Flight; end a session; start Signal from its own room; attach an existing Flight; create a Flight automatically; and verify that the automatically created Flight appears back in Flights.
- Browser console: no runtime errors. The only entries are expected prototype-only Babel standalone precompile warnings.

### Required fidelity surfaces

- Fonts and typography: the accepted mono/data hierarchy is preserved across denser Flight metadata, statuses, source labels, drawer help, and dark Signal controls. Identifiers remain tabular and unwrapped at desktop width.
- Spacing and layout rhythm: Flights keeps the accepted page header and table silhouette while adding summary and lifecycle bands. The 500 px drawers preserve the established Hangar interaction pattern. Signal retains its status strip, toolbar, map, and inspection panels after Flight attachment.
- Colors and tokens: light operational surfaces, dark Signal surfaces, aqua selection, green detected context, gray Preparation, amber review, borders, radii, and shadows use existing Sillage tokens.
- Image quality and asset fidelity: the accepted terrain asset and Exopter brand assets are unchanged. New controls use the existing Lucide-derived icon family; no raster placeholder, emoji, handcrafted SVG, or decorative CSS asset was introduced.
- Copy and content: the interface explains `Preparation → Live or SD import → Processing → Analysed / Review`, distinguishes FlySight from ExoFDR, names SD-card acquisition, and explicitly states how detected or unresolved Signal context becomes Flight data.
- Interaction and accessibility: actions are native buttons; drawers expose dialog labels and named close controls; selects have visible labels; active choices and focus states are visible; horizontal overflow is contained inside the Flights table at compact width without hiding persistent navigation.

### Comparison history

#### Pass 5

- P2: the first lifecycle capture retained the legacy `Logbook` section name while the page and primary entity had become Flights; the summary also rendered the grammatically incorrect `1 flights`.
- Fix: renamed the section and header to Flights and made summary counts singular-aware.

#### Pass 6

- Post-fix evidence: `36-flights-preparation-lifecycle.png`, `qa-flights-lifecycle-pair.png`, and the browser DOM snapshot showing `1 flight`.
- Result: the new workflow remains visually continuous with the accepted Flights and Signal directions, and no actionable P0, P1, or P2 finding remains.

### Focused-region comparison

- Drawer screenshots `37`, `38`, `39`, `42`, and `43` were reviewed separately because their field labels, detected-context values, status copy, and footer actions are not legible enough in full-view comparisons. The source-selection cards, labeled associations, help text, and primary actions remain readable and consistently aligned.

### Follow-up polish

- P3: production imports should expose file-level checksum and validation failures after the parser contract is fixed.
- P3: production Signal should distinguish detected context confidence and let an operator correct an automatically created Flight without leaving the session.

## Iteration: unified Signal workspace, PiP focus, and presentation mode

### Evidence

- Source visual truth:
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/16-signal-live-map-final.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/17-signal-instruments-final.png`
  - `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/18-signal-charts-final.png`
- Browser-rendered implementation:
  - `45-signal-unified-dashboard.png` — all three live views in one workspace.
  - `46-signal-focus-map-pip.png` — Map primary with Instruments and Charts PiPs.
  - `47-signal-focus-map-collapsed.png` — Map primary with reduced preview rails.
  - `48-signal-focus-instruments.png` — Instruments primary.
  - `49-signal-focus-charts.png` — Charts primary.
  - `50-signal-presentation-1920.png` — full-display presentation mode.
  - `51-signal-dashboard-900.png` — compact-width stacking behavior.
  - All relative screenshot paths above are under `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/`.
- Combined comparison evidence:
  - `qa-signal-unified-contact-sheet.jpg` — accepted Map, Instruments, and Charts source views plus the unified implementation in one 2 × 2 comparison.
  - `qa-signal-map-focus-pair.jpg`
  - `qa-signal-instruments-focus-pair.jpg`
  - `qa-signal-charts-focus-pair.jpg`

### Normalization and tested state

- Source and desktop implementation captures are 1280 × 820 px at CSS viewport 1280 × 820 and device scale factor 1; the contact sheet is 2560 × 1640 px and the focused pairs are 2560 × 820 px. No density resampling was required.
- Presentation mode was captured at CSS viewport and implementation pixels 1920 × 1080, device scale factor 1. Its fixed Signal root measured exactly 1920 × 1080 and document scroll width remained 1920 px.
- Compact verification used CSS viewport 900 × 820. `window.innerWidth`, `document.body.scrollWidth`, and `document.documentElement.scrollWidth` all returned 900 px.
- States inspected: unified dashboard, each primary panel, live PiPs, reduced preview rails, presentation mode, short Internet interruption with an 18-second cloud delay, recovery, and operator event marking.
- Primary interactions tested: Dashboard/Map/Instruments/Charts selection; panel-level Enlarge and Dashboard restore; Reduce/Show previews; Full screen/Exit full screen; Internet cut/recovery; Mark event; and the Signal session creation path.
- Browser console: no runtime errors. The only entries are expected prototype-only Babel standalone precompile warnings.

### Required fidelity surfaces

- Fonts and typography: the accepted mono/data hierarchy, uppercase telemetry labels, tabular numeric values, and HUD-green primary readings are preserved. Small PiP labels remain readable at 1280 px; secondary panel subtitles truncate rather than collide.
- Spacing and layout rhythm: the default grid gives the Map the dominant area and stacks Instruments and Charts in the inspection column. Focus mode uses a full primary canvas plus two aligned PiPs; reduced mode converts them into 38 px rails. Presentation mode removes the application shell and uses the full display without overflow.
- Colors and tokens: carbon surfaces, aqua selection and live state, HUD green, amber caution, field green, borders, and elevation remain mapped to the existing Sillage tokens.
- Image quality and asset fidelity: the accepted terrain asset keeps a sharp cover crop at 1280 and 1920 px. The existing icon family, live flight path, aircraft marker, heading line, attitude reconstruction, and chart canvas are retained; no placeholder imagery or substitute icon style was introduced.
- Copy and content: all three coordinated views are visible as `Live map`, `Instruments`, and `Charts`. Controls use operator language (`Reduce previews`, `Show previews`, `Full screen`), cloud backlog is expressed as elapsed time, and the landing-zone label retains its distance in focus mode.
- States and accessibility: view selection uses a named tablist, panels are named regions, panel actions and full-screen state are labeled, live controls are native buttons, and the main path is keyboard-addressable. Exact production screen-reader and zoom testing remains deferred.

### Comparison history

#### Pass 7

- P2: the first compact Charts panel reused the full six-row chart and clipped its lower series in the unified dashboard.
- P2: the first focus layout positioned PiPs over the primary panel header and partially covered the Landing Zone label.
- P2: the first focused Instruments and Charts layouts kept their value/health sidebars beneath the PiP column, hiding important secondary readings.
- Fixes: added a four-row compact chart renderer; moved PiPs below the primary header; repositioned the focused Landing Zone and event marker; and moved primary value/stream-health summaries into bottom-right overlays below the PiPs.

#### Pass 8

- P2: the Landing Zone label still ended at the PiP edge in the first post-fix Map comparison.
- Fix: moved the focused Landing Zone anchor from 64% to 60% so the complete zone name and `8.6 km` remain visible.
- Post-fix visual evidence: `45-signal-unified-dashboard.png`, `46-signal-focus-map-pip.png`, `48-signal-focus-instruments.png`, `49-signal-focus-charts.png`, `50-signal-presentation-1920.png`, and all four combined comparison files listed above.
- Result: the accepted visual identity and detailed contents of all three source views remain visible in one dynamic workspace. No actionable P0, P1, or P2 finding remains.

### Focused-region comparison

- Focused pair comparisons were required because instrument tape proportions, chart-series density, stream-health values, the live path, and the landing-zone label are too small to judge in the full 2 × 2 sheet. The post-fix pairs show the same terrain/track treatment, attitude reconstruction, six-series focused chart, numeric hierarchy, and semantic colors as their accepted sources.

### Follow-up polish

- P3: production presentation mode should use the browser Fullscreen and Screen Wake Lock APIs in addition to the prototype's full-viewport layer.
- P3: production PiPs may add drag-and-dock positioning if real operations show that a fixed right column obscures a mission-specific map area.
- P3: compact widths are intentionally scrollable; a dedicated mobile ground-station layout is outside this large-screen dashboard scope.

## Iteration: remove Flights summary and lifecycle bands

### Evidence

- Source visual truth: `/var/folders/xk/pz2njdpx4jg8twv09ql7wmxw0000gn/T/TemporaryItems/NSIRD_screencaptureui_JJLM9K/Screenshot 2026-07-28 at 22.56.31.png` — the exact summary cards and lifecycle band selected for removal.
- Browser-rendered implementation: `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/52-flights-summary-removed.png`.
- Combined comparison evidence: `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/qa-flights-summary-removal.jpg`.

### Normalization and tested state

- Source crop: 2480 × 250 px, normalized to 1280 × 129 px for the combined comparison.
- Implementation: CSS viewport and screenshot 1280 × 820 px, device scale factor 1. Compact verification used 900 × 820 px with document and body scroll widths equal to 900 px.
- State: base Flights list with six rows and no active drawer.
- Primary interactions tested: search filtering and clearing, and opening/closing the New flight drawer.
- Browser console: no runtime errors; only the expected prototype-only Babel standalone warning.

### Required fidelity surfaces

- Fonts and typography: the existing Flights title, explanatory line, table headers, identifiers, and statuses are unchanged.
- Spacing and layout rhythm: the table now follows the page header and actions directly. The removed cards and lifecycle strip leave no residual gap or empty container.
- Colors and tokens: no palette or token changes were introduced.
- Image quality and asset fidelity: no assets were added, replaced, or modified.
- Copy and content: `In preparation`, `Acquiring / processing`, `Data sources`, and the four-step lifecycle strip are absent from the rendered DOM. Flight rows retain their status and source values.
- Interaction and accessibility: the search, Import data, New flight, row actions, and drawer semantics are preserved.

### Findings and comparison history

- No actionable P0, P1, or P2 finding was introduced by this scoped removal. The first browser capture matched the requested deletion and required no visual correction.
- Focused-region comparison was not required because the supplied source is itself a focused crop and the removed elements can be confirmed directly in both the DOM and combined comparison.

## Iteration: clarify Hangar parent and section hierarchy

### Evidence

- Source visual truth: `/var/folders/xk/pz2njdpx4jg8twv09ql7wmxw0000gn/T/TemporaryItems/NSIRD_screencaptureui_c8nDuu/Screenshot 2026-07-28 at 22.58.28.png` — the original hierarchy with the selected section title above the navigation that controls it.
- Browser-rendered implementation: `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/53-hangar-navigation-hierarchy.png`.
- Combined comparison evidence: `/Users/julien/.codex/visualizations/2026/07/28/019fa7d5-91b3-7883-8ff5-196bdc748810/sillage-unified/qa-hangar-navigation-hierarchy.jpg`.

### Normalization and tested state

- Source crop: 1118 x 282 px, normalized to 1280 x 323 px for the combined comparison.
- Implementation: CSS viewport and screenshot 1280 x 820 px, device scale factor 1. The combined comparison is 1280 x 1163 px.
- Compact verification used CSS viewport 900 x 820 px; `window.innerWidth`, body scroll width, and document scroll width all returned 900 px with no horizontal overflow.
- State: Hangar open with Parts selected.
- Primary interactions tested: Fleet, Assemblies, Parts, Functions, and Qualification selection. In every state, the page `h1` remained `Hangar` and the section `h2` changed below the navigation.
- Browser console: no runtime errors; only the expected prototype-only Babel standalone warning.

### Required fidelity surfaces

- Fonts and typography: `Hangar` is now the stable page-level heading; the selected section uses the smaller `h2` hierarchy beneath the navigation. Existing mono labels, uppercase tabs, table headers, and body typography are preserved.
- Spacing and layout rhythm: the visual order is now permanent Hangar header, section navigation, then selected-section heading and controls. The added 20 px separation makes the parent-child relationship explicit without creating an empty band.
- Colors and tokens: no palette or token changes were introduced; the active tab, borders, page background, and carbon action button remain consistent with the accepted Hangar direction.
- Image quality and asset fidelity: no visible imagery, icons, or logos were added, replaced, or modified.
- Copy and content: the stable header explains the full Hangar scope; each selected section now owns its concise title, description, and action directly below the tabs.
- Interaction and accessibility: the section control remains a named navigation of native buttons; semantic `h1` and `h2` order now matches the visual hierarchy.

### Findings and comparison history

#### Pass 9

- P2: the supplied source showed a selected child section (`Parts`) as the page-level title above the navigation that selected it. This inverted the apparent parent-child relationship and made the controls feel as though they changed content above themselves.
- Fix: made `Hangar` a permanent page-level header, kept the five-section navigation directly below it, and moved each section title, description, and action underneath the navigation.

#### Pass 10

- Post-fix evidence: `53-hangar-navigation-hierarchy.png` and `qa-hangar-navigation-hierarchy.jpg` show the corrected reading order. Browser checks confirmed the stable `Hangar` heading and corresponding section heading across all five tabs, at both 1280 px and 900 px widths.
- Result: no actionable P0, P1, or P2 finding remains.

### Focused-region comparison

- No additional focused comparison was required: the supplied source is already a focused crop of the exact hierarchy under review, and the combined comparison keeps the full corrected Hangar header, navigation, and selected-section heading readable.

final result: passed
