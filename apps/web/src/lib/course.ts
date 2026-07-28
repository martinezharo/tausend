import type { Course, Word } from '@tausend/engine';
import data from './data/de.json';

/**
 * The compiled course, shipped as static data.
 *
 * It is imported rather than fetched so the service worker precaches it with
 * the app bundle — a session started on the underground behaves exactly like
 * one started on wifi. At ~100 kB for 241 words this is comfortably cheap; a
 * full thousand-word course with audio moves to a separate precached asset.
 */
export const course = data as unknown as Course;

export const wordBySlug = new Map<string, Word>(course.words.map((w) => [w.slug, w]));
export const wordById = new Map<string, Word>(course.words.map((w) => [w.id, w]));

export const genderClass = (word: Pick<Word, 'gender'>) =>
  word.gender ? `g-${word.gender}` : 'g-none';

/** How a word should be shown: nouns are never displayed without their article. */
export const display = (word: Word) => (word.gender ? `${word.gender} ${word.lemma}` : word.lemma);

export const posLabel: Record<string, string> = {
  noun: 'Substantiv',
  verb: 'Verb',
  adj: 'Adjektiv',
  adv: 'Adverb',
  det: 'Artikelwort',
  pron: 'Pronomen',
  prep: 'Präposition',
  conj: 'Konjunktion',
  wh: 'Fragewort',
  part: 'Partikel',
  num: 'Zahlwort'
};
