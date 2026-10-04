# NOTICE — BioHuman

BioHuman
Copyright (C) 2026 Brahyan Belalcazar (SouthWest AI Labs / iberi22)

This product is licensed under the GNU Affero General Public License v3.0 or later
(see `LICENSE`). Portions of this software are adapted from the projects listed below,
each under its own license.

---

## 1. Exercise artwork and exercise catalogue metadata

The exercise illustrations under `public/exercises/` are **not** covered by the AGPL.

| Layer | License | File |
|---|---|---|
| 906 SVG illustrations (`frame-{1,2,3}.svg`) | **CC BY-SA 4.0** | `public/exercises/LICENSE-ASSETS` |
| Original pose artwork by Everkinetic | **CC BY-SA 4.0** | `public/exercises/ATTRIBUTION.md` |
| `workout-guide` package code and APIs | **MIT** | `public/exercises/LICENSE-MIT` |

Attribution (as required by CC BY-SA 4.0):

> Art © [Bryl Lim](https://bryllim.com), based on
> [Everkinetic](https://github.com/everkinetic/data), CC BY-SA 4.0.
> Source: [`bryllim/workout-guide`](https://github.com/bryllim/workout-guide) 1.0.0
> (`aac5992`). Full per-frame attribution: `/exercises/ATTRIBUTION.md`.

Changes made to the artwork, as CC BY-SA 4.0 requires them to be indicated:

- **SVGO** minification of the SVG markup.
- Replacement of `fill="#fff"` with `fill="currentColor"` so the silhouettes inherit
  the active theme colour.

**ShareAlike notice:** the modified artwork remains licensed under **CC BY-SA 4.0**.
Any redistribution or adaptation of these SVG files must keep that license and this
attribution.

The in-app attribution page (`/creditos`) renders this same notice to users.

---

## 2. Upstream source of the illustrations

`workout-guide` traces its poses to Everkinetic and retains, for 76 first-pose frames,
the exact upstream source URL and the recorded changes in
`packages/workout-guide/manifest.json`. That provenance is preserved in
`public/exercises/ATTRIBUTION.md`.

The original pose artwork is licensed by Everkinetic under CC BY-SA 4.0. Recolouring or
vector-tracing those assets creates adaptations that remain under CC BY-SA 4.0 — which is
why this project distributes them under that same license rather than a permissive one.

---

## 3. Adapted third-party code

### openGym

Portions of the training domain logic, the UI shell and the AI Coach validation layer are
adapted from:

> **openGym** — Copyright (C) 2026 Duarte Santos
> <https://github.com/DuarteSantos8/openGym> — AGPL-3.0-or-later

The upstream `NOTICE.md` also records an additional permission under section 7 of the AGPL
v3.0 permitting distribution of the openGym mobile application through app store platforms
whose terms would otherwise be incompatible with the AGPL, provided the corresponding source
remains available under the AGPL at the project repository. That permission applies to the
distribution channel only and does not otherwise limit the license.

Adapted modules are listed per-wave in `docs/PORT-OPENGYM-BIOHUMAN.md`.

### MuscleMap — body diagram geometry

The muscle outlines used by the body maps are derived from
[MuscleMap](https://github.com/melihcolpan/MuscleMap) by Melih Colpan, used under the
**MIT License**. MuscleMap ships its path data as Swift source rather than `.svg` files; the
paths were converted to a JSON module, its sub-group shapes were dropped, and nothing else
about the artwork was changed.

### Lucide — line icons

Interface icons are based on [Lucide](https://lucide.dev), licensed under the **ISC License**.

---

## 4. Ecosystem components

BioHuman builds on the shared SWAL components:

- `@swal/ui` — Apache-2.0
- `@swal/vault` — AGPL-3.0-or-later
- `@swal/health-contract` — data contract `swal.health/v1`, authored in this ecosystem

Exercise references use the `wg:<slug>` identifier form defined by the ecosystem contract.

---

## 5. Health and nutrition data

Estimated energy values use MET figures from the
[2024 Adult Compendium of Physical Activities](https://pacompendium.com/adult-compendium/).
Exercise difficulty is estimated by heuristic; the catalogue carries no verified technique
instructions. See `/creditos`.

This project is not a medical device and provides no clinical advice.