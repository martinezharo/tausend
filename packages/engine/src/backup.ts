import type { Progress } from './types.ts';

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer = (v: unknown) => nonnegative(v) && Number.isSafeInteger(v);
const date = (v: unknown): v is string => typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

/** Validate before replacing either live or stored progress. */
export function validateProgress(value: unknown, wordIds: ReadonlySet<string>): Progress {
  const fail = (): never => { throw new Error('Invalid progress data or words not supported by this course.'); };
  if (!object(value) || !object(value.cards) || !Array.isArray(value.introduced) ||
      !Array.isArray(value.activeDays) || !Array.isArray(value.answers)) return fail();
  if (!value.introduced.every((id) => typeof id === 'string' && wordIds.has(id)) ||
      new Set(value.introduced).size !== value.introduced.length) return fail();
  const introduced = new Set(value.introduced);
  const keyValid = (key: unknown): key is string => {
    if (typeof key !== 'string') return false;
    const parts = key.split('#');
    return parts.length === 2 && introduced.has(parts[0]) &&
      ['recognise', 'gender', 'listen', 'speak', 'cloze', 'produce'].includes(parts[1]);
  };
  for (const [key, card] of Object.entries(value.cards)) {
    if (!keyValid(key) || !object(card) || !date(card.due) ||
        (card.last_review !== undefined && !date(card.last_review)) ||
        !nonnegative(card.stability) || !nonnegative(card.difficulty) || card.difficulty > 10 ||
        !['elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses', 'state'].every((f) => integer(card[f])) ||
        (card.state as number) > 3) return fail();
  }
  if (!value.activeDays.every((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && date(`${day}T00:00:00.000Z`)) ||
      !value.answers.every((a) => object(a) && nonnegative(a.at) && a.at <= 8.64e15 && keyValid(a.key) &&
        Object.hasOwn(value.cards as object, a.key) && typeof a.correct === 'boolean')) return fail();
  return structuredClone(value) as unknown as Progress;
}

export function exportBackup(progress: Progress, language: string): string {
  return JSON.stringify({ app: 'tausend', version: 1, language, exportedAt: new Date().toISOString(), progress }, null, 2);
}

export function importBackup(text: string, language: string, wordIds: ReadonlySet<string>): Progress {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!object(data) || data.app !== 'tausend') throw new Error('Choose a Tausend progress backup.');
  if (data.version !== 1) throw new Error('This backup version is not supported.');
  if (data.language !== language) throw new Error('This backup belongs to a different language.');
  return validateProgress(data.progress, wordIds);
}
