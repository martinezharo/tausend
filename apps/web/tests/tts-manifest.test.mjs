import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

import { LETTER_NAMES } from '../src/lib/alphabet.ts';

/**
 * The guard on a stale manifest.
 *
 * Every line the app can say is rendered ahead of time by
 * `data/scripts/synth-audio.mjs`. Adding a sentence without re-running it
 * leaves that one line to the browser's own voice — which is exactly the
 * inconsistency the clips exist to remove, and is invisible on a machine that
 * happens to have a German voice installed. So the two are checked to agree.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '../src/lib/data');

const course = JSON.parse(readFileSync(resolve(DATA, 'de.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(DATA, 'tts-de.json'), 'utf8'));

const recorded = new Set(
  course.words.filter((word) => word.audio).map((word) => word.lemma.toLowerCase())
);
const bare = (token) => token.trim().replace(/^[.,!?;:„“”"'…]+|[.,!?;:„“”"'…]+$/g, '');

test('every sentence has a clip', () => {
  for (const sentence of course.sentences) {
    assert.ok(manifest[sentence.de], `no clip for ${JSON.stringify(sentence.de)}`);
  }
});

test('every sentence tile has a recording or a clip', () => {
  for (const sentence of course.sentences) {
    for (const token of sentence.de.split(/\s+/)) {
      const text = bare(token);
      if (!text || recorded.has(text.toLowerCase())) continue;
      assert.ok(manifest[text], `no clip for tile ${JSON.stringify(text)}`);
    }
  }
});

test('every story line, and every story whole, has a clip', () => {
  for (const story of course.stories) {
    for (const line of story.lines) {
      assert.ok(manifest[line.de], `no clip for ${JSON.stringify(line.de)}`);
    }
    const whole = story.lines.map((line) => line.de).join(' ');
    assert.ok(manifest[whole], `no clip for the whole of ${story.id}`);
  }
});

test('every plural has a clip', () => {
  for (const word of course.words) {
    if (!word.plural) continue;
    assert.ok(manifest[`die ${word.plural}`], `no clip for die ${word.plural}`);
  }
});

test('every letter name has a clip', () => {
  for (const name of Object.values(LETTER_NAMES)) {
    assert.ok(manifest[name], `no clip for the letter name ${name}`);
  }
});

test('every clip in the manifest is on disk, and none is orphaned', () => {
  const dir = resolve(HERE, '../static/audio/de/tts');
  for (const [text, file] of Object.entries(manifest)) {
    assert.ok(existsSync(resolve(dir, file)), `${file} missing for ${JSON.stringify(text)}`);
  }
});
