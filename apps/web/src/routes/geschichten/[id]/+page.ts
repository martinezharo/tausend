import { error } from '@sveltejs/kit';
import { course } from '$lib/course.ts';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => course.stories.map((s) => ({ id: s.id }));

export const load: PageLoad = ({ params }) => {
  const story = course.stories.find((s) => s.id === params.id);
  if (!story) error(404, `No story "${params.id}"`);
  return { story };
};
