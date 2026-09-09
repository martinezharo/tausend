import type { Word } from '@tausend/engine';
import { course } from './course.ts';

/**
 * Audio.
 *
 * Word pronunciations are real human recordings from the German Wiktionary
 * pronunciation project via Wikimedia Commons, loudness-normalised, shipped as
 * AAC and packaged with the app.
 *
 * Sentences, spelled-out letters and stories have no recordings — nobody has
 * read this course's invented example sentences aloud — so those fall back to
 * the device's speech synthesis. The UI says which is which rather than
 * passing synthesis off as the real thing.
 *
 * Synthesis is the weak half and behaves accordingly: one German voice is
 * chosen per session and reused, and a device with no German voice at all
 * stays silent rather than reading German through its own locale's accent.
 */

const CLIPS = `/audio/${course.language}/`;

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

/**
 * Say one token of a sentence, for the tiles a learner taps while building it.
 *
 * The human clips are recordings of lemmas, so an inflected token must not be
 * answered with its lemma's clip — tapping "bin" and hearing "sein" would
 * teach the wrong sound. Only an exact lemma gets the recording; every other
 * token is synthesised.
 */
export function playToken(token: string): void {
  // Only at the edges: "geht's" is one word, and "gehts" is not how it sounds.
  const text = token.trim().replace(/^[.,!?;:„“”"'…]+|[.,!?;:„“”"'…]+$/g, '');
  if (!text) return;
  const word = clipByLemma.get(text.toLowerCase());
  if (word) play(word);
  else speakText(text);
}

// ------------------------------------------------------- synthesis fallback

/**
 * The German alphabet, written the way a German voice reads it aloud.
 *
 * A synthesiser handed a bare "k" is as likely to say the sound as the name,
 * and which one it picks differs by platform. Spelling the names out removes
 * the guess: tapping K always says "kah", the way a German would spell it.
 */
const LETTER_NAMES: Record<string, string> = {
  a: 'Ah', b: 'Beh', c: 'Zeh', d: 'Deh', e: 'Eh', f: 'Eff', g: 'Geh',
  h: 'Hah', i: 'Ih', j: 'Jott', k: 'Kah', l: 'Ell', m: 'Emm', n: 'Enn',
  o: 'Oh', p: 'Peh', q: 'Kuh', r: 'Err', s: 'Ess', t: 'Teh', u: 'Uh',
  v: 'Vau', w: 'Weh', x: 'Iks', y: 'Ypsilon', z: 'Zett',
  ä: 'Ä', ö: 'Ö', ü: 'Ü', ß: 'Eszett'
};

/**
 * Say one tile of a word a learner is spelling out.
 *
 * The bank holds single letters plus, for a noun, its article as one tile —
 * so "der " is a word to be read and "K" is a letter to be named.
 */
export function spellToken(token: string): void {
  const text = token.trim();
  if (!text) return;
  if (text.length === 1) {
    const name = LETTER_NAMES[text.toLowerCase()];
    speakText(name ?? text, 1);
    return;
  }
  speakText(text);
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
 * Synthesised German. Used for sentences, letters and stories only.
 *
 * Silent when the device has no German voice installed. A machine whose own
 * locale is Spanish will happily read "Ich bin hier" with Spanish vowels if
 * asked, and a course that teaches the wrong sounds is worse than a quiet one.
 */
export function speakText(text: string, rate = 0.9): void {
  if (!available()) return;
  stop();
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

let warmed = false;

export function warm(): void {
  // Idempotent: every call used to add another `voiceschanged` listener.
  if (warmed || !available()) return;
  warmed = true;
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', () => pickVoice());
}
