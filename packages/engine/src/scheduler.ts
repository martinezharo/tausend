import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State,
  type Card
} from 'ts-fsrs';
import type { Progress, Rating, Skill, StoredCard, Word } from './types.ts';

/**
 * Scheduling.
 *
 * One FSRS card per (word, skill) pair, not per word. Recognising `Haus` and
 * producing `Haus` decay at different rates, and knowing its gender is a third
 * thing again — collapsing them into a single interval is the reason most
 * flashcard apps leave you able to read a word but not say it.
 */

const params = generatorParameters({
  // 90% is the FSRS default and a good fit for vocabulary: high enough that
  // sentences stay readable, low enough that reviews don't pile up.
  request_retention: 0.9,
  enable_fuzz: true
});

const f = fsrs(params);

const RATING: Record<Rating, FsrsRating.Again | FsrsRating.Hard | FsrsRating.Good | FsrsRating.Easy> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy
};

export const cardKey = (wordId: string, skill: Skill) => `${wordId}#${skill}`;

export function parseKey(key: string): { wordId: string; skill: Skill } {
  const i = key.lastIndexOf('#');
  return { wordId: key.slice(0, i), skill: key.slice(i + 1) as Skill };
}

const toStored = (c: Card): StoredCard => ({
  due: c.due.toISOString(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state as 0 | 1 | 2 | 3,
  last_review: c.last_review?.toISOString()
});

const fromStored = (s: StoredCard): Card => ({
  due: new Date(s.due),
  stability: s.stability,
  difficulty: s.difficulty,
  elapsed_days: s.elapsed_days,
  scheduled_days: s.scheduled_days,
  learning_steps: s.learning_steps,
  reps: s.reps,
  lapses: s.lapses,
  state: s.state as State,
  last_review: s.last_review ? new Date(s.last_review) : undefined
});

export const emptyProgress = (): Progress => ({
  cards: {},
  introduced: [],
  activeDays: [],
  answers: []
});

export function getCard(progress: Progress, key: string, now: Date): StoredCard {
  return progress.cards[key] ?? toStored(createEmptyCard(now));
}

export const isDue = (card: StoredCard, now: Date) => new Date(card.due).getTime() <= now.getTime();

/** Days of memory stability — the engine's own measure of how well a skill is held. */
export const stabilityOf = (progress: Progress, key: string): number =>
  progress.cards[key]?.stability ?? 0;

export const hasSeen = (progress: Progress, key: string): boolean =>
  progress.cards[key] !== undefined && progress.cards[key].state !== State.New;

/**
 * Record an answer and return a NEW progress object. Never mutates its input,
 * so callers can keep it in a store and get change detection for free.
 */
export function review(progress: Progress, key: string, rating: Rating, now = new Date()): Progress {
  const current = fromStored(getCard(progress, key, now));
  const { card } = f.next(current, now, RATING[rating]);

  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { wordId } = parseKey(key);

  return {
    cards: { ...progress.cards, [key]: toStored(card) },
    introduced: progress.introduced.includes(wordId)
      ? progress.introduced
      : [...progress.introduced, wordId],
    activeDays: progress.activeDays.includes(day) ? progress.activeDays : [...progress.activeDays, day],
    answers: [
      ...progress.answers.slice(-499),
      { at: now.getTime(), key, correct: rating !== 'again' }
    ]
  };
}

/** Convert correctness into a conservative FSRS grade. Timing is retained for API compatibility. */
export function gradeFor(correct: boolean, _ms: number): Rating {
  if (!correct) return 'again';
  // Speed reflects typing, device and accessibility as much as memory.
  return 'good';
}

/**
 * Words the learner can be said to know: introduced, and whose `recognise`
 * card is not lapsed back to New. This is what the coverage number is built
 * on, so it deliberately does not count words merely glimpsed once.
 */
export function knownWords(progress: Progress, words: Word[]): Word[] {
  const known = new Set(
    progress.introduced.filter((id) => hasSeen(progress, cardKey(id, 'recognise')))
  );
  return words.filter((w) => known.has(w.id));
}

export function dueKeys(progress: Progress, now = new Date()): string[] {
  return Object.entries(progress.cards)
    .filter(([, c]) => isDue(c, now))
    .sort((a, b) => new Date(a[1].due).getTime() - new Date(b[1].due).getTime())
    .map(([k]) => k);
}
