import { expect, test } from '@playwright/test';

test('le jeu démarre sans erreur et rend la scène', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('canvas')).toBeVisible();

  // Au moins quelques frames réellement dessinées par WebGL.
  await page.waitForFunction(() => (window as any).__game.frames() > 5);
  expect(await page.evaluate(() => (window as any).__game.drawCalls())).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
