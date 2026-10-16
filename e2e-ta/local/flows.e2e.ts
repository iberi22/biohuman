import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * Mutating journeys: they create routines, start sessions, log sets, or save
 * settings, so they must never run against the deployed target. They are tagged
 * `mutating` and `e2e:ta` pins `--target local`; `e2e:ta:live` selects the
 * read-only smoke file and additionally excludes this tag.
 */
const MUTATING = { tags: ['mutating'] } as const;

test('starting a training session from /entrenar shows the session UI', MUTATING, async ({ app, screen }) => {
  await app.open('/entrenar');
  await screen.getByRole('link', { name: 'Ver rutinas →' }).tap();
  await screen.getByRole('button', { name: 'Empezar', exact: true }).first().tap();
  await expect(screen.getByRole('button', { name: 'Registrar serie', exact: true })).toBeVisible();
});

test('/historial shows the finished session', MUTATING, async ({ app, screen, browser }) => {
  await app.open('/rutinas');
  await screen.getByRole('button', { name: 'Empezar', exact: true }).first().tap();
  await screen.getByLabel('Repeticiones', { exact: true }).fill('12');
  await screen.getByRole('button', { name: 'Registrar serie', exact: true }).tap();
  await screen.getByRole('button', { name: 'Finalizar entrenamiento' }).tap();
  await expect(browser).toHaveURL(/\/historial/);
  await expect(screen.getByText('1 sesión guardada')).toBeVisible();
});

test('settings page renders and theme or language toggle changes the UI', MUTATING, async ({ app, screen, browser }) => {
  await app.open('/ajustes');
  await screen.getByLabel('Tema').selectOption('Oscuro');
  await screen.getByRole('button', { name: 'Guardar ajustes' }).tap();
  await expect(screen.getByText('Ajustes guardados.')).toBeVisible();
  await expect(browser.locator('html')).toHaveAttribute('data-theme', 'dark');
});
