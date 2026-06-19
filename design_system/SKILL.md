---
name: exopter-design
description: Use this skill to generate well-branded interfaces and assets for Exopter, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

Exopter builds personal **rigid-wing flight systems**; **Sillage** is its operating
software suite. The design language should feel like flight-test equipment: matte,
precise, physical, safety-aware. Carbon + vapor base, signal colors that annotate
(never decorate), tabular numerals for all data, factual operational copy, no hype,
no emoji.

Key files:
- `readme.md` — full design guide (content fundamentals, visual foundations, iconography, manifest).
- `styles.css` → `tokens/*` — the token CSS (colors, type, spacing, fonts). Link `styles.css`.
- `guidelines/*.card.html` — foundation specimens (colors, type, spacing, brand).
- `components/<group>/*.jsx` — React primitives (Button, IconButton, Input, Select, Switch, SegmentedControl, Badge, StatusDot, Toast, Card, MetricTile, ReadinessStrip, ChecklistRow). Each has a `.prompt.md` with usage.
- `ui_kits/sillage-flight/` — the Sillage Flight workbench recreation.
- `ui_kits/exopter-brand/` — the deep-tech public brand page.
- `assets/` — wing photo + NON-FINAL placeholder logo marks.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets
out and create static HTML files for the user to view. If working on production code,
copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without other guidance, ask them what they want to
build or design, ask some questions, and act as an expert designer who outputs HTML
artifacts _or_ production code, depending on the need.

Caveats to relay: webfonts are Google Fonts substitutes (Inter, IBM Plex Mono); the
icon set is Lucide (substitution); all logo marks are non-final placeholders derived
from the wing photo, not official artwork.
