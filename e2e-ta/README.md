# Tester-Army / e2e

End-to-end testing suite for BioHuman. Tests are split into two groups:
- **Smoke tests:** Read-only journeys run on both local and live targets, located in `e2e-ta/smoke.e2e.ts` (tagged `read-only`).
- **Local flows:** Mutating journeys (starting sessions, form submissions, data creation, settings saves) run ONLY on the local target, located in `e2e-ta/local/*.e2e.ts` (tagged `mutating`). `e2e:ta` pins `--target local`, and `e2e:ta:live` selects only `smoke.e2e.ts` and excludes the `mutating` tag.

Real application findings/bugs are in `e2e-ta/findings/`.

## How to run

1. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```
2. Build the app (required since `local` target serves `dist/client`):
   ```bash
   pnpm build
   ```
3. Run tests against local target:
   ```bash
   pnpm run e2e:ta
   ```
4. Run tests against live target (when deployed). The command is read-only: it
   selects `e2e-ta/smoke.e2e.ts` only and excludes the `mutating` tag:
   ```bash
   pnpm run e2e:ta:live
   ```

`E2E_LIVE_URL` defines the `live` target; without it only `local` exists. The
suite contract (script arguments, target isolation, and the read-only split) is
checked by `e2e-ta/suite-contract.test.ts`, which runs with `pnpm test`.

## Results of this run

The `local` column was re-run in this fix session; the `live` rows were not
re-run (no `E2E_LIVE_URL` was configured), so the read-only smoke rows are left
as `Not re-run` rather than claimed.

| Journey | local | live |
| --- | --- | --- |
| home opens with its main heading | Passed | Not re-run |
| each page of the main navigation opens | Passed | Not re-run |
| a real exercise detail page renders the exercise heading | Passed | Not re-run |
| the train page offers a read-only path to routines | Passed | Not re-run |
| settings page renders | Passed | Not re-run |
| starting a training session from /entrenar shows the session UI | Passed | N/A (mutating) |
| /historial shows the finished session | Passed | N/A (excluded) |
| settings page renders and theme or language toggle changes the UI | Passed | N/A (excluded) |
| creating a routine and seeing it in /rutinas works offline | Failed | N/A (excluded) |

## Personas for bug bash (`e2e explore`)

- **Beginner Lifter:** Needs guidance, follows starter routines, and relies heavily on correct technique and simple UI.
- **Experienced Powerlifter:** Focuses on progressive overload, logs heavy weights and multiple sets, and wants quick data entry.
- **Offline User:** Works out in a gym basement with no signal and relies on local-first behavior to save their sessions.
- **Data Analyst:** Constantly checks the `/historial` to see volume trends, weekly breakdowns, and progress charts.
- **CrossFit Enthusiast:** Mixes time, distance, and weight exercises rapidly and depends on quick transitions between exercises.
