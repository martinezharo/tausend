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

export function checkAnswer(exercise: Exercise, given: string): boolean {
  const normalise = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?]/g, '');

  if (exercise.kind === 'produce') {
    // Noun production explicitly asks for the article: omitting it must not
    // certify gender knowledge. Case and punctuation remain forgiving.
    const expected = exercise.word.gender
      ? `${exercise.word.gender} ${exercise.answer}`
      : exercise.answer;
    return normalise(expected) === normalise(given);
  }

  return normalise(exercise.answer) === normalise(given);
}

export const GENDER_OPTIONS = GENDERS;
