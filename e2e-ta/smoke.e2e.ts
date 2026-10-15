import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('home opens with its main heading', async ({ app, screen }) => {
  await app.open('/');
  await expect(screen.getByRole('heading', { name: 'Movimiento, a tu ritmo.' })).toBeVisible();
});

test('each page of the main navigation opens', async ({ app, browser }) => {
  const routes = ['/entrenar', '/rutinas', '/historial', '/biblioteca', '/ajustes'];
  for (const route of routes) {
    await app.open(route);
    await expect(browser).toHaveURL(new RegExp(route + '(\/)?$'));
  }
});

test('starting a training session from /entrenar shows the session UI', async ({ app, screen }) => {
  await app.open('/entrenar');
  await screen.getByRole('link', { name: 'Ver rutinas →' }).tap();
  await screen.getByRole('button', { name: 'Empezar', exact: true }).first().tap();
  await expect(screen.getByRole('button', { name: 'Registrar serie', exact: true })).toBeVisible();
});

test('/historial shows the finished session', async ({ app, screen, browser }) => {
  await app.open('/rutinas');
  await screen.getByRole('button', { name: 'Empezar', exact: true }).first().tap();
  await screen.getByLabel('Repeticiones', { exact: true }).fill('12');
  await screen.getByRole('button', { name: 'Registrar serie', exact: true }).tap();
  await screen.getByRole('button', { name: 'Finalizar entrenamiento' }).tap();
  await expect(browser).toHaveURL(/\/historial/);
  await expect(screen.getByText('1 sesión guardada')).toBeVisible();
});

test('settings page renders and theme or language toggle changes the UI', async ({ app, screen, browser }) => {
  await app.open('/ajustes');
  await screen.getByLabel('Tema').selectOption('Oscuro');
  await screen.getByRole('button', { name: 'Guardar ajustes' }).tap();
  await expect(screen.getByText('Ajustes guardados.')).toBeVisible();
  await expect(browser.locator('html')).toHaveAttribute('data-theme', 'dark');
});
