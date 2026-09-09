import type { Course, Exercise, Gender, Sentence, Skill, Word } from './types.ts';
import { cardKey } from './scheduler.ts';
import { sample, shuffle, type Rng } from './rng.ts';

const GENDERS: Gender[] = ['der', 'die', 'das'];

const strip = (t: string) => t.replace(/[.,!?;:„“"()»«]/g, '');

/**
 * Replace the token belonging to `word` with a blank.
 *
 * The sentence data records which lemmas a sentence uses but not where, so the
 * surface token is located here by matching against the word's form list. For
 * a separable verb this deliberately blanks the stem and leaves the flown
 * prefix in place — seeing "Der Zug ___ um acht Uhr an" is the whole point.
 */
export function maskSentence(sentence: Sentence, word: Word): { masked: string; answer: string } | null {
  const forms = new Set(word.forms.map((f) => f.toLowerCase()));
  const tokens = sentence.de.split(/\s+/);

  for (let i = 0; i < tokens.length; i++) {
    const bare = strip(tokens[i]);
    if (!forms.has(bare.toLowerCase())) continue;
    const punctuation = tokens[i].slice(bare.length);
    const masked = [...tokens.slice(0, i), '___' + punctuation, ...tokens.slice(i + 1)].join(' ');
    return { masked, answer: bare };
  }
  return null;
}

/** Distractors drawn from words the learner has already met, same part of speech first. */
function glossDistractors(word: Word, pool: Word[], rng: Rng): string[] {
  const samePos = pool.filter((w) => w.id !== word.id && w.pos === word.pos);
  const chosen = sample(samePos.length >= 3 ? samePos : pool.filter((w) => w.id !== word.id), 3, rng);
  return chosen.map((w) => w.en[0]);
}

function formDistractors(word: Word, pool: Word[], rng: Rng): string[] {
  const samePos = pool.filter((w) => w.id !== word.id && w.pos === word.pos);
  const source = samePos.length >= 3 ? samePos : pool.filter((w) => w.id !== word.id);
  return sample(source, 3, rng).map((w) => w.lemma);
}

/**
 * Build one exercise. Returns null when the skill cannot be realised right now
 * (for example a cloze whose sentence is not fully known yet), so the session
 * builder can fall through to the next skill.
 */
export function buildExercise(
  word: Word,
  skill: Skill,
  course: Course,
  pool: Word[],
  known: Set<string>,
  rng: Rng
): Exercise | null {
  const key = cardKey(word.id, skill);

  switch (skill) {
    case 'recognise': {
      const answer = word.en[0];
      return {
        kind: 'recognise',
        key,
        word,
        answer,
        options: shuffle([answer, ...glossDistractors(word, pool, rng)], rng)
      };
    }

    case 'gender': {
      if (!word.gender) return null;
      return { kind: 'gender', key, word, answer: word.gender };
    }

    case 'listen': {
      const answer = word.en[0];
      return {
        kind: 'listen',
        key,
        word,
        answer,
        options: shuffle([answer, ...glossDistractors(word, pool, rng)], rng)
      };
    }

    case 'speak': {
      return {
        kind: 'speak',
        key,
        word,
        answer: word.gender ? `${word.gender} ${word.lemma}` : word.lemma,
        prompt: word.en.join(', ')
      };
    }

    case 'produce': {
      return {
        kind: 'produce',
        key,
        word,
        answer: word.lemma,
        prompt: word.en.join(', ')
      };
    }

    case 'cloze': {
      const candidates = course.sentences.filter(
        (s) => s.words.includes(word.id) && s.words.every((w) => known.has(w))
      );
      if (!candidates.length) return null;

      // Prefer a sentence that exists to teach this word specifically.
      const focused = candidates.find((s) => s.focus && word.lemma === s.focus);
      const sentence = focused ?? sample(candidates, 1, rng)[0];

      const masked = maskSentence(sentence, word);
      if (!masked) return null;

      return {
        kind: 'cloze',
        key,
        word,
        sentence,
        masked: masked.masked,
        answer: masked.answer,
        options: shuffle([masked.answer, ...formDistractors(word, pool, rng)], rng)
      };
    }
  }
}

const UMLAUT: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u' };

/** "schön" for "schon" is the mistake the exercise exists to catch. */
const swappedUmlaut = (a: string, b: string) => UMLAUT[a] === b || UMLAUT[b] === a;

/**
 * Levenshtein distance over short strings, with one weighted substitution:
 * trading an umlaut for its base vowel costs more than any tolerance allows,
 * so a length-based slack can never quietly accept it.
 */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution =
        a[i - 1] === b[j - 1] ? 0 : swappedUmlaut(a[i - 1], b[j - 1]) ? 3 : 1;
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + substitution);
    }
    previous = row;
  }
  return previous[b.length];
}

const ARTICLES = new Set(['der', 'die', 'das', 'den', 'dem', 'des']);

function spoken(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[.,!?;:„“”"'’()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Did the microphone hear the target?
 *
 * Recognition is not a spelling test taken through a lossy channel. The
 * transcript comes back with whatever the recogniser thought it heard — an
 * article it invented, a filler word, a near-miss ending — so a target counts
 * as said when it turns up anywhere in the transcript, with a tolerance that
 * grows with the length of the word. Umlauts stay significant: "schon" and
 * "schön" are different sounds and this is the exercise that trains them.
 *
 * The tolerance is deliberately generous. A false failure here punishes a
 * learner for their microphone, and the FSRS card would carry that lapse for
 * weeks; a false pass costs one repetition.
 */
export function speechMatches(target: string, transcript: string): boolean {
  const heard = spoken(transcript);
  if (!heard) return false;

  const wanted = spoken(target);
  const bare = wanted.split(' ').filter((t) => !ARTICLES.has(t)).join(' ');
  const tokens = heard.split(' ');

  // The article is a listening detail, not a pronunciation one: a recogniser
  // drops or invents it freely, so the word itself is what has to be right.
  const candidates = new Set([heard, heard.split(' ').filter((t) => !ARTICLES.has(t)).join(' ')]);
  const words = bare.split(' ').length;
  for (let i = 0; i + words <= tokens.length; i++) candidates.add(tokens.slice(i, i + words).join(' '));

  const tolerance = bare.length >= 8 ? 2 : bare.length >= 5 ? 1 : 0;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (distance(candidate, bare) <= tolerance || distance(candidate, wanted) <= tolerance) return true;
  }
  return false;
}

export function checkAnswer(exercise: Exercise, given: string): boolean {
  const normalise = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?]/g, '');

  if (exercise.kind === 'speak') return speechMatches(exercise.answer, given);

  if (exercise.kind === 'produce') {
    // The article is part of a noun's recall target.
    const expected = exercise.word.gender
      ? `${exercise.word.gender} ${exercise.answer}`
      : exercise.answer;
    return normalise(expected) === normalise(given);
  }

  return normalise(exercise.answer) === normalise(given);
}

export const GENDER_OPTIONS = GENDERS;
