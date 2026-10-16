import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * Read-only journeys only. "Empezar" is not read-only: it calls `begin()` in
 * `src/components/TrainingApp.svelte`, which persists `active-session` in
 * IndexedDB. Mutating journeys live in `e2e-ta/local/flows.e2e.ts` and are
 * tagged `mutating`, so `e2e:ta:live` (positional smoke file plus
 * `--exclude-tag mutating`) can never send them to the deployed target.
 */
const READ_ONLY = { tags: ['read-only'] } as const;

/**
 * The exercise catalog index is `/`; there is no `/biblioteca/` page. A plain
 * static file server answers `/biblioteca/` with a directory listing and HTTP
 * 200, which would be a false positive, while a real deployment can answer 404.
 * Check the library index plus one real detail page from `src/data/exercises.json`.
 */
const EXERCISE_PATH = '/biblioteca/bench-press/';

test('home opens with its main heading', READ_ONLY, async ({ app, screen }) => {
  await app.open('/');
  await expect(screen.getByRole('heading', { name: 'Movimiento, a tu ritmo.' })).toBeVisible();
});

test('each page of the main navigation opens', READ_ONLY, async ({ app, browser, screen }) => {
  const routes = ['/entrenar/', '/rutinas/', '/historial/', '/ajustes/'];
  await app.open('/');
  for (const route of routes) {
    const resPromise = browser.waitForResponse(new RegExp(route + '$'));
    await app.open(route);
    const res = await resPromise;
    expect(res.status).toBe(200);
    await expect(browser).toHaveURL(new RegExp(route + '$'));
  }

  const resPromise = browser.waitForResponse(new RegExp(EXERCISE_PATH + '$'));
  await app.open(EXERCISE_PATH);
  const res = await resPromise;
  expect(res.status).toBe(200);
  await expect(browser).toHaveURL(new RegExp(EXERCISE_PATH + '$'));
  await expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeVisible();
});

test('the train page offers a read-only path to routines', READ_ONLY, async ({ app, screen }) => {
  await app.open('/entrenar');
  await expect(screen.getByRole('heading', { name: 'Elige tu próxima sesión' })).toBeVisible();
  await expect(screen.getByRole('link', { name: 'Ver rutinas →' })).toBeVisible();
});

test('settings page renders', READ_ONLY, async ({ app, screen }) => {
  await app.open('/ajustes');
  await expect(screen.getByLabel('Tema')).toBeVisible();
});
