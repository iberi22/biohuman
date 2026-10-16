import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('creating a routine and seeing it in /rutinas works offline', async ({ app, screen, browser }) => {
  await app.open('/rutinas');

  await screen.getByRole('button', { name: 'Crear rutina' }).tap();
  await screen.getByLabel('Nombre de la rutina').fill('Rutina de prueba');
  await screen.getByRole('button', { name: 'Añadir' }).tap();

  await expect(screen.getByRole('button', { name: 'Quitar' })).toBeVisible();

  await screen.getByRole('button', { name: 'Guardar rutina' }).tap();

  await expect(screen.getByRole('heading', { name: 'Editar rutina' })).not.toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Rutina de prueba' })).toBeVisible();

  await browser.route('**/*', route => route.abort());
  await browser.reload();
  await expect(screen.getByRole('heading', { name: 'Rutina de prueba' })).toBeVisible();
});
