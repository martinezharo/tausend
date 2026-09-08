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

class FakeAudio {
  constructor(src) { this.src = src; }
  load() {}
  pause() {}
  play() { played.push(this.src); return Promise.resolve(); }
}

globalThis.window = globalThis;
globalThis.Audio = FakeAudio;
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.speechSynthesis = {
  getVoices: () => [],
  cancel() {},
  speak(utterance) { spoken.push(utterance.text); },
  addEventListener() {}
};

const audio = await import('../src/lib/audio.ts');

function heard(token) {
  played.length = 0;
  spoken.length = 0;
  audio.playToken(token);
  return { played: [...played], spoken: [...spoken] };
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
