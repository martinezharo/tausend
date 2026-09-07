import { expect, test, type Page } from '@playwright/test';

/** The "3 / 12" counter in the session header, as a pair of numbers. */
async function counter(page: Page): Promise<{ at: number; total: number }> {
  const text = await page.locator('.head .dim').innerText();
  const [at, total] = text.split('/').map((part) => Number(part.trim()));
  return { at, total };
}

/** Answer the card on screen, whatever kind it is. Correctness is not the point. */
async function answerSomething(page: Page): Promise<void> {
  const input = page.locator('input[type="text"]');
  if (await input.isVisible()) {
    await input.fill('etwas');
    await page.getByRole('button', { name: /Prüfen|Check/ }).click();
    return;
  }
  await page.locator('.stack button, .genders button').first().click();
}

test('a session runs, reveals the answer and advances', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.locator('.rail')).toBeVisible();

  const start = await counter(page);
  expect(start.at).toBe(1);
  expect(start.total).toBeGreaterThan(0);

  await answerSomething(page);

  // The verdict is announced, not just coloured.
  const feedback = page.locator('.feedback');
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveAttribute('role', 'status');

  await page.getByRole('button', { name: /Weiter|Continue/ }).click();
  await expect(feedback).toBeHidden();
  expect((await counter(page)).at).toBe(2);
});

test('a missed card is queued to come back before the session ends', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.locator('.rail')).toBeVisible();
  const { total } = await counter(page);

  // New words are taught with four-option recognition, so always taking the
  // first option produces a miss well within a handful of cards.
  let missed = false;
  for (let i = 0; i < 6 && !missed; i += 1) {
    await answerSomething(page);
    missed = await page.locator('.feedback.bad').isVisible();
    await page.getByRole('button', { name: /Weiter|Continue/ }).click();
  }

  expect(missed, 'expected at least one wrong answer in six cards').toBe(true);
  expect((await counter(page)).total).toBeGreaterThan(total);
});
