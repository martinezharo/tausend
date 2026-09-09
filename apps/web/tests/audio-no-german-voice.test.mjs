import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

/**
 * A device with no German voice installed. Its own locale reads "Ich bin hier"
 * with Spanish vowels quite happily if asked, which teaches the wrong sounds —
 * so nothing is asked of it.
 *
 * Its own file because the chosen voice is module state, settled once per load.
 */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('/course.ts')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `export const course = { language: 'de', words: [] };`
      };
    }
    return next(url, context);
  }
});

const spoken = [];

globalThis.window = globalThis;
globalThis.Audio = class { constructor(src) { this.src = src; } load() {} pause() {} play() { return Promise.resolve(); } };
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.speechSynthesis = {
  getVoices: () => [
    { name: 'Monica', lang: 'es-ES', localService: true, default: true, voiceURI: 'es-monica' }
  ],
  cancel() {},
  speak(utterance) { spoken.push(utterance.text); },
  addEventListener() {},
  removeEventListener() {}
};

const audio = await import('../src/lib/audio.ts');

test('nothing is spoken when the device has no German voice', () => {
  audio.speakText('Ich bin hier.');
  audio.spellToken('K');
  audio.playToken('hier');
  assert.deepEqual(spoken, []);
});

test('the UI can tell that synthesis is unavailable', () => {
  assert.equal(audio.hasSynthesis(), false);
});
