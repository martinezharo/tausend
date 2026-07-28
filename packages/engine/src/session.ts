import type { Course, Exercise, Progress, Skill, Word } from './types.ts';
import { cardKey, dueKeys, getCard, isDue, parseKey, stabilityOf } from './scheduler.ts';
import { applicableSkills } from './skills.ts';
import { buildExercise } from './exercises.ts';
import { mulberry32, type Rng } from './rng.ts';

export interface SessionOptions {
  /** Target number of exercises. A session should fit in about three minutes. */
  size?: number;
  /** How many previously unseen words to introduce. */
  newWords?: number;
  /**
   * Slots reserved for skills that have unlocked on known words but have never
   * been practised. Without a reservation these starve behind due reviews: a
   * word's recognition card comes due over and over while listening, cloze and
   * production never get a first outing, and the skill ladder quietly collapses
   * back into a single-sided flashcard deck.
   */
  newSkills?: number;
  now?: Date;
  seed?: number;
}

/**
 * Interleave so that no two adjacent exercises share a word or a skill.
 *
 * Blocked practice (all the nouns, then all the verbs) feels smoother and
 * produces worse retention. This is a deliberate desirable difficulty, so the
 * shuffle is a hard constraint rather than a nicety — but it degrades to a
 * best effort rather than looping forever when a small session makes perfect
 * interleaving impossible.
 */
function interleave(exercises: Exercise[], rng: Rng): Exercise[] {
  const pool = [...exercises];
  const out: Exercise[] = [];

  while (pool.length) {
    const prev = out[out.length - 1];
    let index = pool.findIndex(
      (e) => !prev || (e.word.id !== prev.word.id && e.kind !== prev.kind)
    );
    if (index === -1) index = pool.findIndex((e) => !prev || e.word.id !== prev.word.id);
    if (index === -1) index = Math.floor(rng() * pool.length);
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

/**
 * Assemble a session: everything that is due, then new material to fill.
 *
 * Reviews always come before new words in the selection order (falling behind
 * on reviews is what kills a spaced-repetition habit), but they are interleaved
 * afterwards so the session does not feel like a queue being drained.
 */
export function buildSession(course: Course, progress: Progress, options: SessionOptions = {}): Exercise[] {
  const {
    size = 12,
    newWords = 3,
    newSkills = 2,
    now = new Date(),
    seed = Math.floor(Math.random() * 2 ** 31)
  } = options;
  const rng = mulberry32(seed);

  const byId = new Map(course.words.map((w) => [w.id, w]));
  const known = new Set(progress.introduced);
  const introducedWords = progress.introduced.map((id) => byId.get(id)).filter(Boolean) as Word[];

  // Distractors come from words already met, so a wrong option is never a word
  // the learner has no way to rule out. Early on the pool is padded from the
  // upcoming curriculum instead.
  const pool =
    introducedWords.length >= 6
      ? introducedWords
      : course.words.slice(0, Math.max(12, introducedWords.length + 8));

  const chosen: Exercise[] = [];
  const usedKeys = new Set<string>();

  // 1. Due reviews, oldest first — but not filling the whole session, so that
  //    newly unlocked skills and new words still have room.
  const reviewBudget = Math.max(1, size - newWords - newSkills);
  for (const key of dueKeys(progress, now)) {
    if (chosen.length >= reviewBudget) break;
    const { wordId, skill } = parseKey(key);
    const word = byId.get(wordId);
    if (!word) continue;
    const exercise = buildExercise(word, skill, course, pool, known, rng);
    if (exercise) {
      chosen.push(exercise);
      usedKeys.add(key);
    }
  }

  // 2. Skills that have unlocked on known words but have never been practised.
  //    Taken most-stable-first: the words held best are the ones ready to be
  //    asked for in a harder way.
  const ladder = [...introducedWords].sort(
    (a, b) =>
      stabilityOf(progress, cardKey(b.id, 'recognise')) -
      stabilityOf(progress, cardKey(a.id, 'recognise'))
  );
  for (const word of ladder) {
    if (chosen.length >= size - newWords) break;
    for (const skill of applicableSkills(word, progress, course, known)) {
      const key = cardKey(word.id, skill);
      if (usedKeys.has(key) || progress.cards[key]) continue;
      const exercise = buildExercise(word, skill, course, pool, known, rng);
      if (exercise) {
        chosen.push(exercise);
        usedKeys.add(key);
        break;
      }
    }
  }

  // 3. New words, taken in curriculum order — which is unlock order, not
  //    frequency order. Each new word enters with recognition, and nouns enter
  //    with their gender at the same time.
  //
  //    `newWords` is a floor, not a ceiling. It guarantees new material even
  //    when reviews could fill the whole session, but a cold start has no
  //    reviews at all — and since a word yields one exercise (two if it is a
  //    noun), stopping at `newWords` would end the very first session after
  //    three questions. Keep introducing until the session is actually full.
  let introduced = 0;
  for (const word of course.words) {
    if (known.has(word.id)) continue;
    if (introduced >= newWords && chosen.length >= size) break;
    if (introduced >= size) break;

    let added = false;
    for (const skill of ['recognise', 'gender'] as Skill[]) {
      if (skill === 'gender' && !(word.pos === 'noun' && word.gender)) continue;
      const key = cardKey(word.id, skill);
      if (usedKeys.has(key)) continue;
      const exercise = buildExercise(word, skill, course, pool, known, rng);
      if (exercise) {
        chosen.push(exercise);
        usedKeys.add(key);
        added = true;
      }
    }
    if (added) introduced++;
  }

  // 4. Still short? Top up with the least-stable known material.
  if (chosen.length < size) {
    const spare = Object.keys(progress.cards)
      .filter((k) => !usedKeys.has(k))
      .sort((a, b) => progress.cards[a].stability - progress.cards[b].stability);

    for (const key of spare) {
      if (chosen.length >= size) break;
      const { wordId, skill } = parseKey(key);
      const word = byId.get(wordId);
      if (!word) continue;
      const exercise = buildExercise(word, skill, course, pool, known, rng);
      if (exercise) {
        chosen.push(exercise);
        usedKeys.add(key);
      }
    }
  }

  return interleave(chosen.slice(0, size), rng);
}

/** How much is waiting right now — used for the home screen, not inside a session. */
export function dueCount(progress: Progress, now = new Date()): number {
  return Object.values(progress.cards).filter((c) => isDue(c, now)).length;
}

export function nextDue(progress: Progress, now = new Date()): Date | null {
  const upcoming = Object.values(progress.cards)
    .map((c) => new Date(c.due))
    .filter((d) => d.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

export { getCard };
