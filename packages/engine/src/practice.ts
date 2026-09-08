import type { Exercise, Progress } from './types.ts';

export interface PracticePlan {
  mode: 'choice' | 'letters' | 'words' | 'hinted' | 'write';
  target: string;
  tokens: string[];
  hint: string;
}

/** Remove scaffolding only after spaced successful practice of this skill. */
export function practicePlan(exercise: Exercise, progress: Progress): PracticePlan {
  const target = exercise.kind === 'produce' && exercise.word.gender
    ? `${exercise.word.gender} ${exercise.answer}` : exercise.answer;
  const card = progress.cards[exercise.key];
  const ready = card?.state === 2 && card.reps >= 2 && card.stability >= 3;
  const fluent = ready && card.reps >= 4 && card.stability >= 10;
  const mode = exercise.kind !== 'produce' && exercise.kind !== 'cloze' ? 'choice'
    : fluent ? 'write' : ready ? 'hinted' : exercise.kind === 'cloze' ? 'words' : 'letters';
  const assembled = mode === 'words' && exercise.kind === 'cloze' ? exercise.sentence.de : target;
  return {
    mode,
    target: assembled,
    // Keep a noun's article intact; repeated letters still have separate tile IDs in the UI.
    tokens: mode === 'words' ? assembled.split(/\s+/)
      : mode === 'letters' ? [...(exercise.word.gender ? [exercise.word.gender + ' '] : []), ...Array.from(exercise.answer)] : [],
    hint: target.split(' ').map((word) => word[0] + '＿'.repeat(Math.max(0, Array.from(word).length - 1))).join(' ')
  };
}

/** Compare a constructed sentence without penalising case or final punctuation. */
export function practiceMatches(target: string, answer: string): boolean {
  const normalize = (text: string) => text.normalize('NFC').toLowerCase()
    .replace(/[.,!?;:„“”"']/g, '').replace(/\s+/g, ' ').trim();
  return normalize(target) === normalize(answer);
}
