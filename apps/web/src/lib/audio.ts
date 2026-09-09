import type { Word } from '@tausend/engine';
import { course } from './course.ts';
import { letterName } from './alphabet.ts';
import spoken from './data/tts-de.json';

/**
 * Audio.
 *
 * Word pronunciations are real human recordings from the German Wiktionary
 * pronunciation project via Wikimedia Commons, loudness-normalised, shipped as
 * AAC and packaged with the app.
 *
 * Sentences, story lines and the letters of a word being spelled out have no
 * recordings — nobody has read this course's invented example sentences aloud.
 * Those are synthesised once at build time by data/scripts/synth-audio.mjs and
 * shipped as clips too, so the course sounds the same on every device. The UI
 * says which is which rather than passing synthesis off as a human recording.
 *
 * `speechSynthesis` survives only as a last resort, for a clip that fails to
 * load. It picks one German voice and keeps it, and stays silent on a device
 * with no German voice rather than reading German through the local accent.
 */

const CLIPS = `/audio/${course.language}/`;
const SYNTHESISED = `${CLIPS}tts/`;

/** Text → pre-rendered clip, written by data/scripts/synth-audio.mjs. */
const SPOKEN = spoken as Record<string, string>;

const cache = new Map<string, HTMLAudioElement>();
let unlocked = false;

/**
 * Bumped every time playback is cut short. Pausing an element rejects any
 * `play()` promise still in flight for it, so a superseded request has to be
 * able to tell "this clip is blocked" from "this clip was interrupted" —
 * otherwise its fallback would talk over the clip that replaced it.
 */
let generation = 0;

export const hasClip = (word: Word): boolean => word.audio !== null;

/** Lemma → word, for the recorded words only. Lower-cased for lookup. */
const clipByLemma = new Map<string, Word>(
  course.words.filter((word) => word.audio).map((word) => [word.lemma.toLowerCase(), word])
);

function sound(src: string): HTMLAudioElement {
  let audio = cache.get(src);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = 'auto';
    cache.set(src, audio);
  }
  return audio;
}

function element(word: Word): HTMLAudioElement | null {
  return word.audio ? sound(CLIPS + word.audio) : null;
}

/**
 * Play a file, falling back only when it is refused rather than superseded.
 *
 * A blocked play is not worth surfacing: the learner can tap the speaker. A
 * superseded one must stay quiet, or tapping twice in a row leaves the first
 * word being read over the second.
 */
function start(src: string, fallback: () => void): void {
  const mine = generation;
  const audio = sound(src);
  audio.currentTime = 0;
  audio.play().catch(() => {
    if (mine === generation) fallback();
  });
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
  if (word.audio) {
    start(CLIPS + word.audio, () => speakText(word.lemma));
    return;
  }
  speakText(word.gender ? `${word.gender} ${word.lemma}` : word.lemma);
}

/**
 * Say one token of a sentence, for the tiles a learner taps while building it.
 *
 * The human clips are recordings of lemmas, so an inflected token must not be
 * answered with its lemma's clip — tapping "bin" and hearing "sein" would
 * teach the wrong sound. Only an exact lemma gets the recording; every other
 * token gets its synthesised clip.
 */
export function playToken(token: string): void {
  // Only at the edges: "geht's" is one word, and "gehts" is not how it sounds.
  const text = token.trim().replace(/^[.,!?;:„“”"'…]+|[.,!?;:„“”"'…]+$/g, '');
  if (!text) return;
  const word = clipByLemma.get(text.toLowerCase());
  if (word) play(word);
  else speakText(text);
}

// -------------------------------------------------------- synthesised lines

/**
 * Say one tile of a word a learner is spelling out.
 *
 * The bank holds single letters plus, for a noun, its article as one tile —
 * so "der " is a word to be read and "K" is a letter to be named.
 */
export function spellToken(token: string): void {
  const text = token.trim();
  if (!text) return;
  speakText((text.length === 1 && letterName(text)) || text, 1);
}

/**
 * The voice, held by URI rather than by object: browsers are free to hand back
 * a fresh `SpeechSynthesisVoice` from every `getVoices()` call, and a stale
 * object silently falls back to the default voice when assigned.
 */
let chosen: string | null = null;
let seenVoices = false;

function voices(): SpeechSynthesisVoice[] {
  const list = speechSynthesis.getVoices();
  if (list.length) seenVoices = true;
  return list;
}

/** Higher is better. Ranking rather than a find-chain so the choice is total. */
function rank(v: SpeechSynthesisVoice): number {
  const lang = v.lang.toLowerCase().replace('_', '-');
  return (lang === 'de-de' ? 4 : 0) + (v.localService ? 2 : 0) + (v.default ? 1 : 0);
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!available()) return null;
  const all = voices();
  // Once a voice is settled on, keep it. Re-deciding as the list fills in is
  // what made a sentence come out in a different voice for every tile tapped.
  if (chosen) {
    const still = all.find((v) => v.voiceURI === chosen);
    if (still) return still;
  }
  const german = all.filter((v) => v.lang.toLowerCase().startsWith('de'));
  if (!german.length) return null;
  // Name as the tiebreak, so two equally good voices do not alternate.
  german.sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
  chosen = german[0].voiceURI;
  return german[0];
}

/**
 * Run something once the voice list is known.
 *
 * Desktop Chrome and Firefox populate `getVoices()` asynchronously and return
 * an empty list until they do. Speaking into that gap leaves the utterance on
 * the browser's default voice — which reads German in whatever accent the
 * machine's own locale has — so it is worth the wait.
 */
function withVoice(run: (voice: SpeechSynthesisVoice | null) => void): void {
  if (seenVoices || voices().length) {
    run(pickVoice());
    return;
  }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    speechSynthesis.removeEventListener('voiceschanged', go);
    run(pickVoice());
  };
  const timer = setTimeout(go, 1000);
  speechSynthesis.addEventListener('voiceschanged', go);
}

export function available(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Say a German line: sentences, story lines, plurals, spelled-out letters.
 *
 * Everything the course itself says has a clip built by synth-audio.mjs, so
 * this is a lookup rather than synthesis in every ordinary case. `rate` only
 * reaches the fallback — a pre-rendered clip is already at speaking pace.
 */
export function speakText(text: string, rate = 0.9): void {
  stop();
  const file = SPOKEN[text.trim()];
  if (file) {
    start(SYNTHESISED + file, () => synthesise(text, rate));
    return;
  }
  synthesise(text, rate);
}

/**
 * The last resort, for a line with no clip or a clip that would not load.
 *
 * Silent when the device has no German voice installed. A machine whose own
 * locale is Spanish will happily read "Ich bin hier" with Spanish vowels if
 * asked, and a course that teaches the wrong sounds is worse than a quiet one.
 */
function synthesise(text: string, rate: number): void {
  if (!available()) return;
  const mine = generation;
  withVoice((voice) => {
    // Superseded while the voice list loaded, or nothing German to say it in.
    if (mine !== generation || !voice) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = rate;
    speechSynthesis.speak(utterance);
  });
}

export function hasSynthesis(): boolean {
  return available() && pickVoice() !== null;
}

/**
 * Whether a line can be heard at all: a clip covers it, or the device can fall
 * back to synthesising it. A button that would be silent is not worth drawing.
 */
export function canSay(text: string): boolean {
  return text.trim() in SPOKEN || hasSynthesis();
}

let warmed = false;

export function warm(): void {
  // Idempotent: every call used to add another `voiceschanged` listener.
  if (warmed || !available()) return;
  warmed = true;
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', () => pickVoice());
}
