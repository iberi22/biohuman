import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('home opens with its main heading', async ({ app, screen }) => {
  await app.open('/');
  await expect(screen.getByRole('heading', { name: 'Movimiento, a tu ritmo.' })).toBeVisible();
});

test('each page of the main navigation opens', async ({ app, browser }) => {
  const routes = ['/entrenar/', '/rutinas/', '/historial/', '/biblioteca/', '/ajustes/'];
  await app.open('/');
  for (const route of routes) {
    const resPromise = browser.waitForResponse(new RegExp(route + '$'));
    await app.open(route);
    const res = await resPromise;
    expect(res.status).toBe(200);
    await expect(browser).toHaveURL(new RegExp(route + '$'));
  }
});

test('starting a training session from /entrenar shows the session UI', async ({ app, screen }) => {
  await app.open('/entrenar');
  await screen.getByRole('link', { name: 'Ver rutinas →' }).tap();
  // read-only click
  await screen.getByRole('button', { name: 'Empezar', exact: true }).first().tap();
  await expect(screen.getByRole('button', { name: 'Registrar serie', exact: true })).toBeVisible();
});

test('settings page renders', async ({ app, screen }) => {
  await app.open('/ajustes');
  await expect(screen.getByLabel('Tema')).toBeVisible();
});
