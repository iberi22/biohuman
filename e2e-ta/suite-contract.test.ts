import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for the `e2e:ta` suite. Each one reproduces a scenario the
 * merge-gate review found broken, so a regression fails here instead of in a
 * run against the deployed target.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE = path.join(ROOT, 'e2e-ta/smoke.e2e.ts');
const FLOWS = path.join(ROOT, 'e2e-ta/local/flows.e2e.ts');
const E2E_BIN = path.join(ROOT, 'node_modules/.bin/e2e');

const scripts = (JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
const exerciseSlugs = new Set(
  (JSON.parse(readFileSync(path.join(ROOT, 'src/data/exercises.json'), 'utf8')) as { slug: string }[]).map((exercise) => exercise.slug),
);

/**
 * The positional arguments a package script hands to `e2e run`, with `list`
 * instead of `run`: it collects and selects exactly the same way, but starts no
 * app and no browser, so the test can inspect the real command's selection.
 * `E2E_LIVE_URL` is defined so the `live` target exists, exactly as in the run
 * the review was about.
 */
function selectionFor(script: string): string {
  const command = scripts[script];
  expect(command, `package.json must define ${script}`).toBeTruthy();
  const match = /\be2e run (.*)$/s.exec(command);
  expect(match?.[1], `${script} must run \`e2e run\``).toBeTruthy();
  const args = ['list', ...match![1].match(/"[^"]*"|'[^']*'|\S+/g)!.map((token) => token.replace(/^['"]|['"]$/g, ''))];
  try {
    return execFileSync(E2E_BIN, args, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, E2E_TELEMETRY_DISABLED: '1', E2E_LIVE_URL: 'http://127.0.0.1:1' },
    });
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string; message?: string };
    throw new Error(`${script} selection failed: ${failure.stderr || failure.stdout || failure.message}`);
  }
}

/** Every quoted absolute path a test file uses, so a route can be checked against the app. */
const quotedPaths = (source: string): string[] => [...source.matchAll(/['"](\/[^'"\n]*)['"]/g)].map((match) => match[1]);

/** Source without comments, so prose that names an action is not mistaken for the action. */
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('e2e-ta suite contract', () => {
  it('selects the read-only smoke file for the live target with supported globs', () => {
    // Before the fix the script passed `'!e2e-ta/local/**'` as a positional
    // glob, which `e2e` rejects with `INVALID_GLOB` before any test runs.
    const selection = selectionFor('e2e:ta:live');
    expect(selection).toContain('e2e-ta/smoke.e2e.ts');
    expect(selection).toContain('[live]');
  });

  it('keeps the standard command on the local target even when E2E_LIVE_URL is set', () => {
    // Before the fix `e2e:ta` selected every target, so `local/flows.e2e.ts`
    // created a workout and saved settings against the deployed app.
    const selection = selectionFor('e2e:ta');
    expect(selection).toContain('e2e-ta/local/flows.e2e.ts');
    expect(selection).toContain('[local]');
    expect(selection).not.toContain('[live]');
  });

  it('never selects the mutating local flows for the live target', () => {
    expect(selectionFor('e2e:ta:live')).not.toContain('e2e-ta/local/');
  });

  it('keeps mutating journeys out of the read-only smoke file', () => {
    const smoke = withoutComments(readFileSync(SMOKE, 'utf8'));
    const flows = readFileSync(FLOWS, 'utf8');
    // "Empezar" runs `begin()`, which persists `active-session` in IndexedDB.
    for (const mutating of ['Empezar', 'Registrar serie', 'Guardar rutina', 'Guardar ajustes']) {
      expect(smoke, `smoke.e2e.ts must not trigger "${mutating}"`).not.toContain(mutating);
    }
    expect(flows).toContain('Empezar');
    expect(flows).toContain("tags: ['mutating']");
    expect(smoke).toContain("tags: ['read-only']");
  });

  it('smoke-tests a real exercise page because /biblioteca/ has no index page', () => {
    const paths = quotedPaths(withoutComments(readFileSync(SMOKE, 'utf8')));
    // `python3 -m http.server` answers /biblioteca/ with a directory listing and
    // HTTP 200, so asserting a 200 there passes without the app rendering.
    expect(paths).not.toContain('/biblioteca/');
    const details = paths.filter((entry) => entry.startsWith('/biblioteca/'));
    expect(details.length).toBeGreaterThan(0);
    for (const detail of details) {
      const slug = detail.slice('/biblioteca/'.length).replace(/\/$/, '');
      expect(exerciseSlugs.has(slug), `${detail} must name an exercise in src/data/exercises.json`).toBe(true);
    }
  });
});
