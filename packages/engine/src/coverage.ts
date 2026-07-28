import type { Course, Progress, ShowcaseToken, Story, Word } from './types.ts';
import { knownWords } from './scheduler.ts';

/**
 * Lexical coverage.
 *
 * This is the number the whole product is organised around, so it is measured
 * against the real corpus rather than estimated from a word count. Coverage is
 * the share of running text the learner can read, which is why the top 25
 * words are worth more than the next 200.
 *
 * Worth stating plainly somewhere in the UI: ~95% coverage is the threshold
 * for reasonable comprehension and ~98% for unassisted reading. A thousand
 * words is a skeleton, not fluency.
 */

export interface CoverageReport {
  /** Share of corpus tokens covered, 0..1. */
  share: number;
  knownCount: number;
  totalWords: number;
  /** Coverage the learner would reach after finishing the whole course. */
  ceiling: number;
  /** Extra coverage the next word in the curriculum would add. */
  nextGain: number;
}

export function coverage(course: Course, progress: Progress): CoverageReport {
  const known = knownWords(progress, course.words);
  const covered = known.reduce((n, w) => n + w.corpusCount, 0);
  const share = covered / course.corpus.totalTokens;

  const knownIds = new Set(known.map((w) => w.id));
  const next = course.words.find((w) => !knownIds.has(w.id));

  return {
    share,
    knownCount: known.length,
    totalWords: course.words.length,
    ceiling: course.coverage[course.coverage.length - 1] ?? 0,
    nextGain: next ? next.corpusCount / course.corpus.totalTokens : 0
  };
}

/** Coverage the course reaches after its first `n` words, straight from the build. */
export const coverageAfter = (course: Course, n: number): number =>
  n <= 0 ? 0 : course.coverage[Math.min(n, course.coverage.length) - 1];

export interface ShowcaseState extends ShowcaseToken {
  known: boolean;
  /** True when the token is outside the course vocabulary altogether. */
  beyond: boolean;
}

/**
 * The home screen text, annotated. Tokens the learner knows render normally;
 * everything else is blocked out. Progress is legibility.
 */
export function showcase(course: Course, progress: Progress): ShowcaseState[] {
  const known = new Set(knownWords(progress, course.words).map((w) => w.id));
  return course.showcase.tokens.map((t) => ({
    ...t,
    known: t.word !== null && known.has(t.word),
    beyond: t.word === null
  }));
}

export function showcaseShare(state: ShowcaseState[]): number {
  if (!state.length) return 0;
  return state.filter((t) => t.known).length / state.length;
}

/** Stories the learner can read end to end right now. */
export function readableStories(course: Course, progress: Progress): Story[] {
  const known = new Set(knownWords(progress, course.words).map((w) => w.id));
  return course.stories.filter((s) => s.lines.every((l) => l.words.every((w) => known.has(w))));
}

/** The next story, and how many words are still missing from it. */
export function nextStory(
  course: Course,
  progress: Progress
): { story: Story; missing: Word[] } | null {
  const known = new Set(knownWords(progress, course.words).map((w) => w.id));
  const byId = new Map(course.words.map((w) => [w.id, w]));

  const locked = course.stories
    .map((story) => {
      const missing = [...new Set(story.lines.flatMap((l) => l.words))]
        .filter((id) => !known.has(id))
        .map((id) => byId.get(id))
        .filter(Boolean) as Word[];
      return { story, missing };
    })
    .filter((s) => s.missing.length > 0)
    .sort((a, b) => a.missing.length - b.missing.length);

  return locked[0] ?? null;
}
