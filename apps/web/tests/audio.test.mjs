import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

/**
 * The rule under test is the one that decides what a tapped tile sounds like.
 * A recording belongs to a lemma, so an inflected token must never borrow it:
 * tapping "bin" and hearing "sein" would teach the wrong sound.
 */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('/course.ts')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `export const course = { language: 'de', words: [
          { lemma: 'sein', gender: null, audio: 'sein.m4a' },
          { lemma: 'Haus', gender: 'das', audio: 'haus.m4a' },
          { lemma: 'hier', gender: null, audio: null }
        ] };`
      };
    }
    return next(url, context);
  }
});

const played = [];
const spoken = [];
const voices = [];

class FakeAudio {
  constructor(src) { this.src = src; }
  load() {}
  pause() {}
  play() { played.push(this.src); return Promise.resolve(); }
}

/** Two German voices, so the pick has something to be deterministic about. */
const VOICES = [
  { name: 'Zoe', lang: 'de-DE', localService: true, default: false, voiceURI: 'de-zoe' },
  { name: 'Anna', lang: 'de-DE', localService: true, default: false, voiceURI: 'de-anna' },
  { name: 'Monica', lang: 'es-ES', localService: true, default: true, voiceURI: 'es-monica' }
];

globalThis.window = globalThis;
globalThis.Audio = FakeAudio;
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.speechSynthesis = {
  // A fresh object per call, the way Safari and Chrome hand voices back.
  getVoices: () => VOICES.map((v) => ({ ...v })),
  cancel() {},
  speak(utterance) { spoken.push(utterance.text); voices.push(utterance.voice.voiceURI); },
  addEventListener() {},
  removeEventListener() {}
};

const audio = await import('../src/lib/audio.ts');

function heard(token) {
  played.length = 0;
  spoken.length = 0;
  voices.length = 0;
  audio.playToken(token);
  return { played: [...played], spoken: [...spoken] };
}

function spelled(token) {
  spoken.length = 0;
  voices.length = 0;
  audio.spellToken(token);
  return spoken[0];
}

test('a lemma with a recording is played, not synthesised', () => {
  assert.deepEqual(heard('sein'), { played: ['/audio/de/sein.m4a'], spoken: [] });
});

test('punctuation and capitalisation do not hide the recording', () => {
  assert.deepEqual(heard('Haus.'), { played: ['/audio/de/haus.m4a'], spoken: [] });
});

test('an inflected form is synthesised rather than borrowing its lemma clip', () => {
  assert.deepEqual(heard('bin'), { played: [], spoken: ['bin'] });
});

test('a lemma without a recording falls back to synthesis', () => {
  assert.deepEqual(heard('hier'), { played: [], spoken: ['hier'] });
});

test('punctuation inside a word is left alone', () => {
  assert.deepEqual(heard('"geht\'s!"'), { played: [], spoken: ["geht's"] });
});

test('a token that is only punctuation says nothing', () => {
  assert.deepEqual(heard('…'), { played: [], spoken: [] });
});

/**
 * Letters are named, not sounded out: the bank a beginner spells "der Kaffee"
 * from holds the article as one tile and every letter as its own.
 */
test('a letter tile is said by its German name', () => {
  assert.equal(spelled('K'), 'Kah');
  assert.equal(spelled('z'), 'Zett');
  assert.equal(spelled('ü'), '\u00dc');
});

test('the article tile is read as a word, not spelled out', () => {
  assert.equal(spelled('der '), 'der');
});

test('a tile of pure whitespace says nothing', () => {
  assert.equal(spelled('  '), undefined);
});

test('every letter of the alphabet has a name', () => {
  for (const letter of 'abcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00fc\u00df') {
    assert.notEqual(spelled(letter), letter, `${letter} falls through unnamed`);
  }
});

/**
 * The complaint this fixes: a sentence built tile by tile came out in a
 * different voice for each word, and on a Spanish-locale desktop the German
 * was read with Spanish vowels.
 */
test('every utterance uses the same voice', () => {
  voices.length = 0;
  audio.spellToken('K');
  audio.spellToken('a');
  audio.playToken('hier');
  assert.equal(new Set(voices).size, 1);
});

test('the voice chosen is a German one, never the system default', () => {
  voices.length = 0;
  audio.playToken('hier');
  assert.ok(voices[0].startsWith('de-'), voices[0]);
});
