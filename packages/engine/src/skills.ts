import type { Course, Progress, Skill, Word } from './types.ts';
import { cardKey, hasSeen, stabilityOf } from './scheduler.ts';

/**
 * The skill ladder.
 *
 * The same word gets progressively harder demands made of it as it stabilises:
 * recognise it, then hear it, then say it, then use it in a sentence, then
 * produce it cold. Thresholds are in days of FSRS stability, so the ladder is
 * driven by actual measured memory rather than by a repetition count.
 *
 * Gender is the exception: it is available from the very first exposure and
 * never gated, because a wrong article fossilises faster than anything else in
 * German and cannot be repaired later by exposure alone.
 */
export const UNLOCK = {
  listen: 1,
  speak: 2,
  cloze: 3,
  produce: 10
} as const;

export function sentencesFor(course: Course, wordId: string) {
  return course.sentences.filter((s) => s.words.includes(wordId));
}

/** Sentences whose every word the learner already knows. */
export function readableSentences(course: Course, known: Set<string>) {
  return course.sentences.filter((s) => s.words.every((w) => known.has(w)));
}

export function applicableSkills(
  word: Word,
  progress: Progress,
  course: Course,
  known: Set<string>
): Skill[] {
  const skills: Skill[] = ['recognise'];

  if (word.pos === 'noun' && word.gender) skills.push('gender');

  const recognise = stabilityOf(progress, cardKey(word.id, 'recognise'));

  if (recognise >= UNLOCK.listen) skills.push('listen');

  // Saying a word you have never heard teaches an accent, not a word, so the
  // microphone only opens once the listening card has actually been answered.
  if (recognise >= UNLOCK.speak && hasSeen(progress, cardKey(word.id, 'listen'))) {
    skills.push('speak');
  }

  if (recognise >= UNLOCK.cloze) {
    const usable = sentencesFor(course, word.id).some((s) => s.words.every((w) => known.has(w)));
    if (usable) skills.push('cloze');
  }

  if (recognise >= UNLOCK.produce && hasSeen(progress, cardKey(word.id, 'listen'))) {
    skills.push('produce');
  }

  return skills;
}

/** Human-readable label for the UI, in the interface's own terse register. */
export const SKILL_LABEL: Record<Skill, string> = {
  recognise: 'Erkennen',
  gender: 'Artikel',
  listen: 'Hören',
  speak: 'Sprechen',
  cloze: 'Lücke',
  produce: 'Schreiben'
};

export const SKILL_HINT: Record<Skill, string> = {
  recognise: 'What does it mean?',
  gender: 'Which article?',
  listen: 'What did you hear?',
  speak: 'Say it out loud',
  cloze: 'Fill the gap',
  produce: 'Write it in German'
};
