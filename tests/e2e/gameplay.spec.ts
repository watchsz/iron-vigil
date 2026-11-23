import { expect, test, type Page } from '@playwright/test';

const game = (page: Page, js: string) => page.evaluate(js) as Promise<any>;

test.beforeEach(async ({ page }) => {
  await page.goto('/?level=0');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await game(page, '__game.pause(true)'); // la sim n'avance plus que via tick()
});

test('poser des tours au clic, lancer une vague et la repousser', async ({ page }) => {
  const gold0 = (await game(page, '__game.snapshot()')).gold;
  for (const [x, y] of [[6, 5], [9, 7], [6, 7]]) {
    const p = await game(page, `__game.cellToScreen(${x}, ${y})`);
    await page.mouse.click(p.x, p.y);
  }
  let snap = await game(page, '__game.snapshot()');
  expect(snap.towers).toHaveLength(3);
  expect(snap.gold).toBe(gold0 - 150);

  await page.getByRole('button', { name: /vague/i }).click();
  await game(page, '__game.tick(30 * 5)');
  expect((await game(page, '__game.snapshot()')).enemies).toBeGreaterThan(0);

  await game(page, '__game.tick(30 * 60)');
  snap = await game(page, '__game.snapshot()');
  expect(snap).toMatchObject({ wave: 1, waveActive: false, lives: 20, enemies: 0 });
  expect(snap.gold).toBeGreaterThan(gold0 - 150);
});

test('défaite quand les vies tombent à 0', async ({ page }) => {
  const wave = page.getByRole('button', { name: /vague/i });
  for (let n = 0; n < 2; n++) {
    await wave.click();
    await game(page, '__game.tick(30 * 60)');
  }
  expect((await game(page, '__game.snapshot()')).status).toBe('lost');
  await expect(page.locator('#message')).toHaveText('Défaite');
  await expect(wave).toBeDisabled();
});

test('sélectionner une tour, l’améliorer puis la vendre via le panneau', async ({ page }) => {
  const p = await game(page, '__game.cellToScreen(6, 5)');
  await page.mouse.click(p.x, p.y); // pose
  await page.mouse.click(p.x, p.y); // sélectionne
  await expect(page.locator('#panelName')).toHaveText(/niveau 1\/3/);
  await page.locator('#upgrade').click();
  expect((await game(page, '__game.snapshot()')).towers).toEqual([{ kind: 'crossbow', level: 1 }]);
  await page.keyboard.press('v');
  expect((await game(page, '__game.snapshot()')).towers).toEqual([]);
  await expect(page.locator('#panel')).toBeHidden();
});
