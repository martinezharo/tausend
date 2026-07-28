import { error } from '@sveltejs/kit';
import { course, wordBySlug } from '$lib/course.ts';
import type { EntryGenerator, PageLoad } from './$types';

/**
 * One prerendered HTML page per word.
 *
 * This is the whole reason the app is a static site rather than a bare SPA:
 * the course data already contains gender, plural, forms, frequency rank and
 * real example sentences, so turning it into ~1000 indexable pages per
 * language costs nothing and is the only acquisition channel an open-source
 * project without a marketing budget actually has.
 */
export const entries: EntryGenerator = () => course.words.map((w) => ({ slug: w.slug }));

export const load: PageLoad = ({ params }) => {
  const word = wordBySlug.get(params.slug);
  if (!word) error(404, `No word "${params.slug}" in this course`);

  const sentences = course.sentences.filter((s) => s.words.includes(word.id)).slice(0, 6);
  const share = word.corpusCount / course.corpus.totalTokens;

  return { word, sentences, share };
};
