import { test, expect } from '@playwright/test';

// Contraste WCAG 2.2 sobre colores compuestos (la UI usa superficies con alfa).
function parseColor(s: string) {
  const m = (s.match(/[\d.]+/g) ?? []).map(Number);
  return { rgb: m.slice(0, 3), alpha: m.length > 3 ? m[3] : 1 };
}
function over(fg: string, bg: number[]) {
  const { rgb, alpha } = parseColor(fg);
  return rgb.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}
function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: number[], b: number[]) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Flujo probado en training.spec.ts: crear una sesion guardada y abrir el
// panel que deja un boton ghost ("Cerrar") visible en pantalla.
async function openGhostButton(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('searchbox').fill('sentadilla');
  await page.getByRole('link', { name: 'Rutinas', exact: true }).click();
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Full body principiante' }) }).getByRole('button', { name: 'Empezar', exact: true }).click();
  await page.getByLabel('Repeticiones', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Registrar serie', exact: true }).click();
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click();
  await page.getByRole('button', { name: 'Enviar a OrionHealth' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible();
}

for (const scheme of ['dark', 'light'] as const) {
  test(`ghost button legible y con borde perceptible en modo ${scheme}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.emulateMedia({ colorScheme: scheme });
    await openGhostButton(page);
    await page.evaluate((s) => { document.documentElement.dataset.theme = s; }, scheme);

    const ghost = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button.swal-btn.ghost')].pop() as HTMLElement;
      const cs = getComputedStyle(btn);
      // Fondo efectivo: componer la cadena de ancestros sobre el fondo del body.
      const chain: string[] = [];
      let node: HTMLElement | null = btn;
      while (node && node !== document.documentElement) {
        chain.push(getComputedStyle(node).backgroundColor);
        node = node.parentElement;
      }
      chain.reverse();
      return { color: cs.color, border: cs.borderTopColor, borderWidth: cs.borderTopWidth, chain, bodyBg: getComputedStyle(document.body).backgroundColor };
    });

    let bg = over(ghost.bodyBg, [255, 255, 255]);
    for (const layer of ghost.chain) bg = over(layer, bg);
    const fg = over(ghost.color, bg);
    const border = over(ghost.border, bg);
    const textRatio = contrast(fg, bg);
    const borderRatio = ghost.borderWidth !== '0px' ? contrast(border, bg) : 0;

    expect(textRatio, `texto ghost ${textRatio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    expect(ghost.borderWidth).not.toBe('0px');
    expect(borderRatio, `borde ghost ${borderRatio.toFixed(2)}:1 (limite no-texto 3:1)`).toBeGreaterThanOrEqual(3);

    if (scheme === 'dark') await page.screenshot({ path: 'test-results/ghost-button-dark.png', fullPage: true });
    expect(errors).toEqual([]);
  });
}
