import { expect, test, type Page } from '@playwright/test';

/** The "3 / 12" counter in the session header, as a pair of numbers. */
async function counter(page: Page): Promise<{ at: number; total: number }> {
  const text = await page.locator('.head .dim').innerText();
  const [at, total] = text.split('/').map((part) => Number(part.trim()));
  return { at, total };
}

/** Answer the card on screen, whatever kind it is. Correctness is not the point. */
async function answerSomething(page: Page): Promise<void> {
  const intro = page.getByRole('button', { name: 'Ready to practise' });
  if (await intro.isVisible()) await intro.click();
  const bank = page.locator('[aria-label="Available tiles"]');
  if (await bank.isVisible()) {
    for (const tile of await bank.getByRole('button').all()) await tile.click();
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    return;
  }
  const input = page.locator('input[type="text"]');
  if (await input.isVisible()) {
    await input.fill('etwas');
    await page.getByRole('button', { name: /Prüfen|Check/ }).click();
    return;
  }
  await page.locator('.stack button, .genders button').first().click();
}

/**
 * Record what the page tries to say. A headless browser has no sound device
 * and usually no German voice, so playback is captured rather than heard:
 * clip filenames for the human recordings, the text itself for synthesis.
 */
async function captureAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    SpeechSynthesis.prototype.speak = function (utterance: SpeechSynthesisUtterance) {
      said.push(utterance.text);
    };
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      // The silent clip that unlocks playback on iOS is not something said.
      if (!this.src.startsWith('data:')) said.push(this.src.split('/').pop() ?? '');
      return Promise.resolve();
    };
  });
}

const said = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __said: string[] }).__said);

/**
 * A learner who already knows every word of "Ich bin hier." and has heard all
 * three. Their next unpractised skill is the sentence itself, which is the
 * one exercise built out of word tiles.
 */
function knowsFirstSentence() {
  const words = ['de:ich:pron', 'de:sein:verb', 'de:hier:adv'];
  const card = {
    due: new Date(Date.now() + 30 * 86400000).toISOString(),
    stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 30,
    learning_steps: 0, reps: 3, lapses: 0, state: 2,
    last_review: new Date(Date.now() - 86400000).toISOString()
  };
  return {
    cards: Object.fromEntries(
      words.flatMap((id) => [[`${id}#recognise`, card], [`${id}#listen`, card]])
    ),
    introduced: words,
    activeDays: [],
    answers: []
  };
}

async function seedProgress(page: Page, progress: unknown): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('tausend', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('kv');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('kv', 'readwrite');
          transaction.objectStore('kv').put(value, 'progress:de');
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    progress
  );
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


test('new material is introduced before recognition and construction', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByRole('button', { name: 'Ready to practise' })).toBeVisible();
  await expect(page.locator('.gloss')).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  const bank = page.locator('[aria-label="Available tiles"]');
  for (let i = 0; i < 12 && !await bank.isVisible(); i++) {
    await answerSomething(page);
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  }
  await expect(bank).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  const tile = bank.getByRole('button').first();
  await tile.click();
  await expect(tile).toBeDisabled();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(tile).toBeEnabled();
  await page.getByRole('button', { name: 'Show me again', exact: true }).click();
  await expect(page.locator('.foot .tip')).toBeVisible();
});


test('a new word is spoken as it is introduced, and again on request', async ({ page }) => {
  await captureAudio(page);
  await page.goto('/learn');
  await expect(page.getByRole('button', { name: 'Ready to practise' })).toBeVisible();

  // Nobody has to press anything to hear the word they are being taught.
  await expect.poll(async () => (await said(page)).length).toBeGreaterThan(0);
  const heard = await said(page);

  await page.getByRole('button', { name: 'Nochmal hören' }).click();
  await expect.poll(async () => (await said(page)).length).toBe(heard.length + 1);
  expect((await said(page)).at(-1)).toBe(heard.at(-1));

  // And it stays quiet once the question starts.
  await page.getByRole('button', { name: 'Ready to practise' }).click();
  await expect(page.getByRole('button', { name: 'Ready to practise' })).toBeHidden();
  expect(await said(page)).toHaveLength(heard.length + 1);
});

test('each word says itself as it is placed into the sentence', async ({ page }) => {
  await captureAudio(page);
  await seedProgress(page, knowsFirstSentence());
  await page.goto('/learn');

  const hint = page.getByText('Rebuild the example with the words below');
  for (let i = 0; i < 12 && !(await hint.isVisible()); i += 1) {
    const intro = page.getByRole('button', { name: 'Ready to practise' });
    if (await intro.isVisible()) {
      await intro.click();
      continue;
    }
    await answerSomething(page);
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  }
  await expect(hint).toBeVisible();

  const tiles = page.locator('[aria-label="Available tiles"]').getByRole('button');
  for (const tile of await tiles.all()) {
    const before = (await said(page)).length;
    const text = (await tile.innerText()).replace(/[.,!?]/g, '').toLowerCase();
    await tile.click();
    await expect.poll(async () => (await said(page)).length).toBe(before + 1);
    const last = (await said(page)).at(-1)?.toLowerCase() ?? '';
    // A recorded lemma arrives as its clip; anything else is synthesised text.
    expect(last === text || last === `${text}.m4a`).toBe(true);
  }
});
