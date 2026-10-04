# `domain/` — ported training domain

Pure functions ported from [openGym](https://github.com/DuarteSantos8/openGym)
(AGPL-3.0-or-later, Copyright (C) 2026 Duarte Santos). See the repository `NOTICE.md`.

These modules hold the training logic and nothing else: no React, no Svelte, no DOM, no storage.
That is deliberate and load-bearing — a function here is verifiable without a click, which is
what makes the engine auditable and lets the MCP server and the UI agree by construction rather
than by convention.

## Ported so far

| Module | Upstream LOC | What it owns |
|---|---|---|
| `workout-model.ts` | 372 | Row shape: warm-up/work phases, set types (straight/dropset/restpause), per-side sets with a scalar mirror, mode resolution with legacy fallbacks |
| `rep-range.ts` | 19 | The two bounds of double progression, normalised and stride-aligned |
| `onerm.ts` | 102 | Estimated 1RM, with the rep cap and the metric-mode rule that stops a timed set being read as reps |
| `dates.ts` | 20 | ISO dates and week keys (the noon-local trick in `startOfWeek` is load-bearing) |
| `bodyweight.ts` | 28 | Weigh-ins grouped into weeks with means and change-vs-last-real-week |
| `bar.ts` | 73 | Bar weight per equipment and per unit, and the plates-per-side split |
| `effort.ts` | 174 | Effort as a statistic: RIR internally, RPE for display; summaries, weekly averages, histogram and colour bands |

That is the whole P0 set. What remains is `history.js` (952) and `exercises.js` (302), and both
need the catalogue — see below.

## Deliberate deviation from upstream

`onerm.ts` and `bar.ts` take a fact as an argument instead of looking the exercise up in openGym's
1,324-entry catalogue (`isAssisted(idOrEx)` → `EXIDX[idOrEx]`, `exOf(idOrId)` → `EXIDX[id]`).
BioHuman does not have that catalogue yet, and hard-coding a stub lookup would put a false claim in
the type. The caller passes the fact — `assisted` for onerm, `eq` for bar — and the catalogue
resolvers land in Wave 3. Same reasoning, same numbers; nothing else was changed to make this
work.

## Blocked until Wave 3

`history.js` (952 LOC) and `exercises.js` (302 LOC) both import the 1,324-entry catalogue, which
cannot be ported with its media: the photos and GIFs have unresolved title (see
`PORT-OPENGYM-BIOHUMAN.md` §2). Their *metadata* can, and that is what Wave 3 brings.

## Rules for porting here

1. **Port the test with the function.** openGym keeps 255 test files alongside the code; the
   legacy fallbacks in these modules are unverifiable any other way.
2. **Preserve the comment that explains the *why*.** These modules read like essays about their
   own edge cases. That commentary is the specification — do not compress it away.
3. **No counters, no stored prescriptions.** The log is what happened; the next target is derived
   from it every time it is needed. Do not introduce state that can drift.
4. **Every new field is optional.** A row written before a field existed must still read
   correctly; that is what the `phase`/`mode` resolvers exist for.
5. **Pure in, pure out.** If a function needs a component to be tested, it is badly written.

## Upstream precedence

When a port and openGym's own test disagree, **the upstream test is the authority** and the port
is wrong until proven otherwise. Do not "fix" the behaviour to match a ported test.

## Shell work (Wave 1, landed but not wired)

`tabbar.ts` holds the bottom bar's decision logic: which tab is lit on a given route, and what the
central button reads and does. `shell/TabBar.svelte` renders it.

**Deliberately not mounted.** BioHuman's `AppShell.svelte` already gives mobile a collapsible menu
(`MobileNav`) with the full navigation, all 7 destinations. Adding a 5-tab bar underneath would put
two navigation systems on the same screen and cut access to the two that do not fit in 5 tabs
(`/intercambio`, `/ajustes`). That is a product decision, not a porting one — it needs the owner's
call on whether mobile gets a bar, a menu, or a menu plus a floating action.

The logic is landed and tested first so either answer is cheap to apply.
