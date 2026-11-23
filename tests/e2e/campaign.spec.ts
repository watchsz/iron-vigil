import { expect, test } from '@playwright/test';

test('menu de campagne : cartes verrouillées puis débloquées par la sauvegarde', async ({ page }) => {
  await page.goto('/');
  const levels = page.locator('#levels button');
  await expect(levels).toHaveCount(3);
  await expect(levels.nth(0)).toBeEnabled();
  await expect(levels.nth(1)).toBeDisabled();

  await page.evaluate(() => localStorage.setItem('iron-vigil:unlocked', '1'));
  await page.reload();
  await expect(levels.nth(1)).toBeEnabled();
  await levels.nth(1).click();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(await page.evaluate(() => (window as any).__game.snapshot().level)).toBe(1);
  await expect(page.locator('#menu')).toBeHidden();
});
