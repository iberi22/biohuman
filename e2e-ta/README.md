# Tester-Army / e2e

End-to-end testing suite for BioHuman. Tests are located in `e2e-ta/smoke.e2e.ts`. Real application findings/bugs are in `e2e-ta/findings/`.

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
4. Run tests against live target (when deployed):
   ```bash
   pnpm run e2e:ta:live
   ```

## Results of this run

| Journey | local | live |
| --- | --- | --- |
| home opens with its main heading | Passed | N/A |
| each page of the main navigation opens | Passed | N/A |
| creating a routine and seeing it in /rutinas works offline | Failed | N/A |
| starting a training session from /entrenar shows the session UI | Passed | N/A |
| /historial shows the finished session | Passed | N/A |
| settings page renders and theme or language toggle changes the UI | Passed | N/A |

## Personas for bug bash (`e2e explore`)

- **Beginner Lifter:** Needs guidance, follows starter routines, and relies heavily on correct technique and simple UI.
- **Experienced Powerlifter:** Focuses on progressive overload, logs heavy weights and multiple sets, and wants quick data entry.
- **Offline User:** Works out in a gym basement with no signal and relies on local-first behavior to save their sessions.
- **Data Analyst:** Constantly checks the `/historial` to see volume trends, weekly breakdowns, and progress charts.
- **CrossFit Enthusiast:** Mixes time, distance, and weight exercises rapidly and depends on quick transitions between exercises.
