import type { Word } from '@tausend/engine';
import { course } from './course.ts';

/**
 * Audio.
 *
 * Word pronunciations are real human recordings from the German Wiktionary
 * pronunciation project via Wikimedia Commons, loudness-normalised and shipped
 * as AAC. They are precached with the app, so a session on the underground
 * sounds the same as one on wifi.
 *
 * Sentences and stories have no recordings — nobody has read this course's
 * invented example sentences aloud — so those fall back to the device's speech
 * synthesis. The UI says which is which rather than passing synthesis off as
 * the real thing.
 */

const CLIPS = `/audio/${course.language}/`;

const cache = new Map<string, HTMLAudioElement>();
let unlocked = false;
let voice: SpeechSynthesisVoice | null = null;

/**
 * Bumped every time playback is cut short. Pausing an element rejects any
 * `play()` promise still in flight for it, so a superseded request has to be
 * able to tell "this clip is blocked" from "this clip was interrupted" —
 * otherwise its fallback would talk over the clip that replaced it.
 */
let generation = 0;

export const hasClip = (word: Word): boolean => word.audio !== null;

function element(word: Word): HTMLAudioElement | null {
  if (!word.audio) return null;
  let audio = cache.get(word.audio);
  if (!audio) {
    audio = new Audio(CLIPS + word.audio);
    audio.preload = 'auto';
    cache.set(word.audio, audio);
  }
  return audio;
}

/**
 * iOS refuses to play audio that was not started from a user gesture, and the
 * refusal is sticky for the whole page until something is played from one.
 * The listening exercise plays on its own as soon as it appears, so the very
 * first tap of a session has to spend a moment unlocking playback.
 */
export function unlock(): void {
  if (unlocked || typeof window === 'undefined') return;
  unlocked = true;
  const silent = new Audio(
    'data:audio/mp4;base64,AAAAHGZ0eXBNNEEgAAAAAE00QSBtcDQyaXNvbQAAAAhmcmVlAAAAG21kYXQhsIGCwvcAAAAdbW9vdgAAAGxtdmhk'
  );
  silent.volume = 0;
  silent.play().catch(() => {});
  pickVoice();
}

/** Pull the next few clips into cache so a drill never stutters. */
export function preload(words: Word[], count = 6): void {
  for (const word of words.slice(0, count)) element(word)?.load();
}

/**
 * Silence everything. Playback is a single channel here: starting a new clip
 * while another is still running just makes both unintelligible, and speech
 * synthesis outlives the page that started it unless it is cancelled.
 */
export function stop(): void {
  generation += 1;
  for (const audio of cache.values()) audio.pause();
  if (available()) speechSynthesis.cancel();
}

export function play(word: Word): void {
  stop();
  const mine = generation;
  const audio = element(word);
  if (audio) {
    audio.currentTime = 0;
    // A blocked play is not worth surfacing: the learner can tap the speaker.
    // A superseded one must stay quiet, or tapping twice in a row leaves the
    // first word being read over the second.
    audio.play().catch(() => {
      if (mine === generation) speakText(word.lemma);
    });
    return;
  }
  speakText(word.gender ? `${word.gender} ${word.lemma}` : word.lemma);
}

// ------------------------------------------------------- synthesis fallback

function pickVoice(): SpeechSynthesisVoice | null {
  if (!available()) return null;
  if (voice) return voice;
  const voices = speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === 'de-DE' && v.localService) ??
    voices.find((v) => v.lang === 'de-DE') ??
    voices.find((v) => v.lang.startsWith('de')) ??
    null;
  return voice;
}

export function available(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Synthesised German. Used for sentences and stories only. */
export function speakText(text: string, rate = 0.9): void {
  if (!available()) return;
  stop();
  const utterance = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) utterance.voice = v;
  utterance.lang = 'de-DE';
  utterance.rate = rate;
  speechSynthesis.speak(utterance);
}

export function hasSynthesis(): boolean {
  return available() && pickVoice() !== null;
}

let warmed = false;

export function warm(): void {
  // Idempotent: every call used to add another `voiceschanged` listener.
  if (warmed || !available()) return;
  warmed = true;
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', () => {
    voice = null;
    pickVoice();
  });
}
