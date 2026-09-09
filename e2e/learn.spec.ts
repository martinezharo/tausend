import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { LETTER_NAMES } from '../apps/web/src/lib/alphabet.ts';

/** The "3 / 12" counter in the session header, as a pair of numbers. */
async function counter(page: Page): Promise<{ at: number; total: number }> {
  const text = await page.locator('.head .dim').innerText();
  const [at, total] = text.split('/').map((part) => Number(part.trim()));
  return { at, total };
}

/**
 * Answer the card on screen, whatever kind it is. Correctness is not the point.
 *
 * Returns false when the card was waved off rather than answered: a speaking
 * card asks for a microphone, so a test that is not about speaking skips it,
 * and no verdict follows.
 */
async function answerSomething(page: Page): Promise<boolean> {
  // Every phase has buttons in the footer; waiting for one is waiting for the
  // card to be on screen at all.
  await expect(page.locator('.foot button').first()).toBeVisible();

  const intro = page.getByRole('button', { name: 'Ready to practise' });
  if (await intro.isVisible()) await intro.click();

  const waveOff = page.getByRole('button', { name: 'Kann nicht sprechen' });
  if (await waveOff.isVisible()) {
    await waveOff.click();
    return false;
  }
  const bank = page.locator('[aria-label="Available tiles"]');
  if (await bank.isVisible()) {
    for (const tile of await bank.getByRole('button').all()) await tile.click();
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    return true;
  }
  const input = page.locator('input[type="text"]');
  if (await input.isVisible()) {
    await input.fill('etwas');
    await page.getByRole('button', { name: /Prüfen|Check/ }).click();
    return true;
  }
  await page.locator('.stack button, .genders button').first().click();
  return true;
}

/**
 * The clips the course ships for its own lines, by filename. Nearly everything
 * the app says is now a file, so a captured filename has to be turned back
 * into the words it holds before a test can assert on it.
 */
const SPOKEN: Record<string, string> = JSON.parse(
  readFileSync(resolve(__dirname, '../apps/web/src/lib/data/tts-de.json'), 'utf8')
);
const textByClip = new Map(Object.entries(SPOKEN).map(([text, file]) => [file, text]));

/** What a captured entry means: the line in a synthesised clip, or the entry itself. */
const meaning = (entry: string): string =>
  (textByClip.get(entry) ?? entry).replace(/[.,!?]/g, '').toLowerCase();

/**
 * Record what the page tries to say. A headless browser has no sound device
 * and usually no German voice, so playback is captured rather than heard:
 * clip filenames for anything with a recording or a built clip, the text
 * itself on the rare line that falls through to the device's own voice.
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

/**
 * Stand in for the browser's speech recognition, which no headless browser has.
 *
 * `transcript` is what the microphone "hears": pass a string to say something
 * specific, or nothing at all to echo the word on screen back — a learner who
 * pronounces it perfectly.
 */
async function stubSpeech(page: Page, transcript?: string): Promise<void> {
  await page.addInitScript((fixed) => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;

      start() {
        setTimeout(() => {
          this.onstart?.();
          const shown = document.querySelector('.plate-word')?.textContent?.trim() ?? '';
          const result: Record<string, unknown> = { 0: { transcript: fixed ?? shown }, length: 1, isFinal: true };
          this.onresult?.({ resultIndex: 0, results: { 0: result, length: 1 } });
          this.onend?.();
        }, 20);
      }
      stop() {}
      abort() {}
    }
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  }, transcript);
}

/**
 * Work through the session until a speaking card is on screen. Each step waits
 * for the card to actually change: reading the next card off a screen that is
 * still showing the previous one is the whole flakiness budget of this suite.
 */
async function reachSpeaking(page: Page): Promise<void> {
  const hint = page.getByText('Say it out loud');
  for (let i = 0; i < 14; i += 1) {
    await expect(page.locator('.foot button').first()).toBeVisible();
    if (await hint.isVisible()) return;
    const intro = page.getByRole('button', { name: 'Ready to practise' });
    if (await intro.isVisible()) {
      await intro.click();
      await expect(intro).toBeHidden();
      continue;
    }
    const before = (await counter(page)).at;
    if (await answerSomething(page)) {
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
    await expect.poll(async () => (await counter(page)).at).toBeGreaterThan(before);
  }
  await expect(hint).toBeVisible();
}

/** The cards actually written to IndexedDB, which is what the scheduler sees. */
async function storedCards(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('tausend', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('kv', 'readonly').objectStore('kv').get('progress:de');
          read.onsuccess = () => {
            db.close();
            resolve(Object.keys((read.result as { cards?: object })?.cards ?? {}));
          };
          read.onerror = () => reject(read.error);
        };
      })
  );
}

const said = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __said: string[] }).__said);

/**
 * A learner who already knows every word of "Ich bin hier." and has heard all
 * three. Whichever rung of the ladder is left unpractised is what the next
 * session asks for, so `skills` says how far up they already are.
 */
function knowsFirstSentence(skills: string[] = ['recognise', 'listen']) {
  const words = ['de:ich:pron', 'de:sein:verb', 'de:hier:adv'];
  const card = {
    due: new Date(Date.now() + 30 * 86400000).toISOString(),
    stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 30,
    learning_steps: 0, reps: 3, lapses: 0, state: 2,
    last_review: new Date(Date.now() - 86400000).toISOString()
  };
  return {
    cards: Object.fromEntries(
      words.flatMap((id) => skills.map((skill) => [`${id}#${skill}`, card]))
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
    if (!(await answerSomething(page))) continue;
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
    if (await answerSomething(page)) {
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
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
  // Speaking sits below the sentence on the ladder, so it has to be behind
  // them already for the sentence to be the skill this session reaches for.
  await seedProgress(page, knowsFirstSentence(['recognise', 'listen', 'speak']));
  await page.goto('/learn');

  const hint = page.getByText('Rebuild the example with the words below');
  for (let i = 0; i < 12 && !(await hint.isVisible()); i += 1) {
    const intro = page.getByRole('button', { name: 'Ready to practise' });
    if (await intro.isVisible()) {
      await intro.click();
      continue;
    }
    if (await answerSomething(page)) {
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
  }
  await expect(hint).toBeVisible();

  const tiles = page.locator('[aria-label="Available tiles"]').getByRole('button');
  for (const tile of await tiles.all()) {
    const before = (await said(page)).length;
    const text = (await tile.innerText()).replace(/[.,!?]/g, '').toLowerCase();
    await tile.click();
    await expect.poll(async () => (await said(page)).length).toBe(before + 1);
    const last = (await said(page)).at(-1) ?? '';
    // A recorded lemma arrives as its own clip, named after the word; every
    // other tile arrives as the content-addressed clip built for that line.
    expect(meaning(last) === text || last.toLowerCase() === `${text}.m4a`).toBe(true);
  }
});


test('a word says its letters as it is spelled out', async ({ page }) => {
  await captureAudio(page);
  // Spelling from a letter bank is the first rung of producing a word, so a
  // session that starts from nothing reaches one within a handful of cards.
  await page.goto('/learn');

  const bank = page.locator('[aria-label="Available tiles"]');
  const tiles = bank.getByRole('button');
  const isLetterBank = async () =>
    (await bank.isVisible()) &&
    (await tiles.allInnerTexts()).every((text) => text.trim().length === 1);

  let reached = false;
  for (let i = 0; i < 14 && !reached; i += 1) {
    const intro = page.getByRole('button', { name: 'Ready to practise' });
    if (await intro.isVisible()) {
      await intro.click();
      continue;
    }
    if (await isLetterBank()) {
      reached = true;
      break;
    }
    if (await answerSomething(page)) {
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
  }
  expect(reached).toBe(true);

  for (const tile of await tiles.all()) {
    const letter = (await tile.innerText()).trim();
    const before = (await said(page)).length;
    await tile.click();
    await expect.poll(async () => (await said(page)).length).toBe(before + 1);
    // Named, not sounded out: tapping K says "kah", the way it is spelled.
    expect(meaning((await said(page)).at(-1) ?? '')).toBe(
      LETTER_NAMES[letter.toLowerCase()].toLowerCase()
    );
  }
});


test('a spoken word is graded by what the microphone heard', async ({ page }) => {
  await captureAudio(page);
  await stubSpeech(page);
  await seedProgress(page, knowsFirstSentence());
  await page.goto('/learn');
  await reachSpeaking(page);

  // The model is played first: the card is imitation, not spelling.
  await expect.poll(async () => (await said(page)).length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Sprechen', exact: true }).click();
  const feedback = page.locator('.feedback');
  await expect(feedback).toBeVisible();
  await expect(feedback).not.toHaveClass(/bad/);
});

test('a mispronounced word is marked wrong and comes back', async ({ page }) => {
  await captureAudio(page);
  await stubSpeech(page, 'Banane');
  await seedProgress(page, knowsFirstSentence());
  await page.goto('/learn');
  await reachSpeaking(page);
  const { total } = await counter(page);

  await page.getByRole('button', { name: 'Sprechen', exact: true }).click();
  await expect(page.locator('.feedback.bad')).toBeVisible();
  expect((await counter(page)).total).toBeGreaterThan(total);
});

test('waving off the microphone skips speaking without failing the card', async ({ page }) => {
  await captureAudio(page);
  await stubSpeech(page);
  await seedProgress(page, knowsFirstSentence());
  await page.goto('/learn');
  await reachSpeaking(page);
  const at = (await counter(page)).at;

  await page.getByRole('button', { name: 'Kann nicht sprechen' }).click();

  // Straight on to the next card: no verdict, and nothing scheduled against it.
  await expect(page.locator('.feedback')).toBeHidden();
  await expect(page.getByText('Say it out loud')).toBeHidden();
  expect((await counter(page)).at).toBeGreaterThan(at);
  expect((await storedCards(page)).filter((key) => key.endsWith('#speak'))).toEqual([]);
});
