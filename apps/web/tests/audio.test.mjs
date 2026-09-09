import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

/**
 * The rules under test are the ones that decide what a tapped tile sounds
 * like: which of the three sources answers it, and whether it is named or
 * read. A recording belongs to a lemma, so an inflected token must never
 * borrow it — tapping "bin" and hearing "sein" would teach the wrong sound.
 */
const STUBS = {
  '/course.ts': `export const course = { language: 'de', words: [
    { lemma: 'sein', gender: null, audio: 'sein.m4a' },
    { lemma: 'Haus', gender: 'das', audio: 'haus.m4a' },
    { lemma: 'hier', gender: null, audio: null }
  ] };`,
  // A stand-in for what synth-audio.mjs writes. "bin" is deliberately absent,
  // so the fallback path stays reachable from a test.
  '/tts-de.json': `export default {
    'hier': 'hier.m4a',
    'Ich bin hier.': 'satz.m4a',
    'Kah': 'kah.m4a',
    'der': 'der.m4a'
  };`
};

registerHooks({
  load(url, context, next) {
    for (const [suffix, source] of Object.entries(STUBS)) {
      if (url.endsWith(suffix)) return { format: 'module', shortCircuit: true, source };
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
  played.length = 0;
  spoken.length = 0;
  voices.length = 0;
  audio.spellToken(token);
  return { played: [...played], spoken: [...spoken] };
}

test('a lemma with a recording is played, not synthesised', () => {
  assert.deepEqual(heard('sein'), { played: ['/audio/de/sein.m4a'], spoken: [] });
});

test('punctuation and capitalisation do not hide the recording', () => {
  assert.deepEqual(heard('Haus.'), { played: ['/audio/de/haus.m4a'], spoken: [] });
});

test('an inflected form never borrows its lemma clip', () => {
  const { played } = heard('bin');
  assert.deepEqual(played, []);
});

test('a lemma without a recording plays its synthesised clip', () => {
  assert.deepEqual(heard('hier'), { played: ['/audio/de/tts/hier.m4a'], spoken: [] });
});

test('a token with no clip of any kind falls back to the device voice', () => {
  assert.deepEqual(heard('bin'), { played: [], spoken: ['bin'] });
});

test('punctuation inside a word is left alone', () => {
  assert.deepEqual(heard('"geht\'s!"'), { played: [], spoken: ["geht's"] });
});

test('a sentence is played from its clip, not read by the device', () => {
  played.length = 0;
  spoken.length = 0;
  audio.speakText('Ich bin hier.');
  assert.deepEqual(played, ['/audio/de/tts/satz.m4a']);
  assert.deepEqual(spoken, []);
});

test('a token that is only punctuation says nothing', () => {
  assert.deepEqual(heard('…'), { played: [], spoken: [] });
});

/**
 * Letters are named, not sounded out: the bank a beginner spells "der Kaffee"
 * from holds the article as one tile and every letter as its own.
 */
test('a letter tile is said by its German name', () => {
  // "Kah" has a clip; the rest fall through to the device and show the name.
  assert.deepEqual(spelled('K'), { played: ['/audio/de/tts/kah.m4a'], spoken: [] });
  assert.deepEqual(spelled('z').spoken, ['Zett']);
  assert.deepEqual(spelled('\u00fc').spoken, ['\u00dc']);
});

test('the article tile is read as a word, not spelled out', () => {
  assert.deepEqual(spelled('der '), { played: ['/audio/de/tts/der.m4a'], spoken: [] });
});

test('a tile of pure whitespace says nothing', () => {
  assert.deepEqual(spelled('  '), { played: [], spoken: [] });
});

test('every letter of the alphabet has a name', () => {
  for (const letter of 'abcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00fc\u00df') {
    const { played, spoken } = spelled(letter);
    assert.ok(played.length || spoken.length, `${letter} says nothing`);
    assert.notDeepEqual(spoken, [letter], `${letter} falls through unnamed`);
  }
});

/**
 * The complaint this fixes: a sentence built tile by tile came out in a
 * different voice for each word, and on a Spanish-locale desktop the German
 * was read with Spanish vowels.
 */
test('every fallback utterance uses the same voice', () => {
  voices.length = 0;
  audio.spellToken('z');
  audio.spellToken('a');
  audio.playToken('bin');
  assert.equal(new Set(voices).size, 1);
});

test('the voice chosen is a German one, never the system default', () => {
  voices.length = 0;
  audio.playToken('bin');
  assert.ok(voices[0].startsWith('de-'), voices[0]);
});

/** The manifest is what makes a line sound the same on every device. */
test('canSay is true for a line with a clip, whatever the device has', () => {
  assert.equal(audio.canSay('Ich bin hier.'), true);
});
