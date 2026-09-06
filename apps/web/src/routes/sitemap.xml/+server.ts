import { course } from '$lib/course.ts';

export const prerender = true;

/**
 * One entry per word page. The trainer itself is excluded — it is an app
 * surface with nothing to index, and pointing crawlers at it would only
 * dilute the pages that do have content.
 */
export function GET() {
  const paths = [
    '/',
    '/woerter',
    '/phrases',
    '/geschichten',
    '/ueber',
    ...course.stories.map((s) => `/geschichten/${s.id}`),
    ...course.words.map((w) => `/wort/${w.slug}`)
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${p}</loc></url>`).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'content-type': 'application/xml' } });
}
