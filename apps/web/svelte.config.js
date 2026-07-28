import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // Fully static: the trainer never talks to a server, and the word pages
    // are real prerendered HTML so they can be indexed.
    adapter: adapter({ fallback: '404.html', strict: true }),
    prerender: {
      handleHttpError: 'fail'
    },
    alias: {
      $engine: '../../packages/engine/src'
    }
  }
};
