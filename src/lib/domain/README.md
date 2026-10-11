# `domain/` — ported training domain

Pure functions ported from [openGym](https://github.com/DuarteSantos8/openGym)
(AGPL-3.0-or-later, Copyright (C) 2026 Duarte Santos). See the repository `NOTICE.md`.

These modules hold the training logic and nothing else: no React, no Svelte, no DOM, no storage.
That is deliberate and load-bearing — a function here is verifiable without a click, which is
what makes the engine auditable and lets the MCP server and the UI agree by construction rather
than by convention.

## Ported so far

| Module | Lines |
|---|---|
| `bar.ts` | 98 |
| `bodyweight.ts` | 63 |
| `catalogue.ts` | 410 |
| `dates.ts` | 40 |
| `effort.ts` | 335 |
| `format.ts` | 117 |
| `history.ts` | 521 |
| `onerm.ts` | 267 |
| `plates.ts` | 376 |
| `progression.ts` | 1030 |
| `rep-range.ts` | 35 |
| `session-rows.ts` | 268 |
| `tabbar.ts` | 120 |
| `workout-model.ts` | 551 |

## history.ts & catalogue.ts

`history.ts` is 521 lines with 36 exports. It is not blocked. The upstream `history.js` is 1252 lines with 72 exports. There are 38 names present in `src/lib/domain`, and 34 names still absent. The absent names are: workoutAt, setsFromRows, setLabel, defaultConfig, setsRepsOf, exLine, cleanupSg, pairAdjacent, unpairSuperset, NOTE_MAX, pinnedNoteFor, exNoteFor, freestyleConfig, barFloor, applyIntensifierPlan, applyFailurePlan, workoutVolume, workoutDay, setsDoneActive, lastBW, supersetUnits, sessionSections, moveSupersetUnit, moveRoutineEntry, streakWeeks, cascadeWeight, canBeWarmup, makeWarmupAt, makeWorkAt, setSpanAt, copySpanAt, copyRowAt, insertRowAt, removeLastSet.

`catalogue.ts` indexes the 302-entry `exercises.json` and does not contain openGym photos or GIFs.

## Deliberate deviation from upstream

`onerm.ts` and `bar.ts` take a fact as an argument instead of looking the exercise up in openGym's
catalogue. `onerm.ts` takes the `assisted` flag as an argument (the resolver is `isAssisted` in `catalogue.ts`), and `bar.ts` takes `eq`.
Nothing else was changed to make this work.

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
call on whether mobile gets a bar, a menu, or a menu plus a floating action (swal-docs #90). `AppShell.svelte` has zero `TabBar` imports.

The logic is landed and tested first so either answer is cheap to apply.
