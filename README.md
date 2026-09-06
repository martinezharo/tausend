# Tausend

Learn frequent German words from English in the order that unlocks real
sentences fastest. Tausend is an offline-first PWA: progress stays in IndexedDB
on the device, with no account, application server, or analytics.

The compiler accepts language-specific data directories, but the current web
app ships the German course only.

## Current course

The checked-in course contains 241 words, 80 sentences, and 3 short stories. Its
coverage is measured against 151,705,378 tokens from the OpenSubtitles 2018
frequency corpus, not estimated from the number of words:

| Course words | Corpus coverage |
|---:|---:|
| 25 | 40.7% |
| 50 | 47.8% |
| 100 | 55.4% |
| 241 | 66.5% |

This is a foundation, not fluency. The current 241-word lexicon is seed content
for the planned 1,000-word course.

## How it works

- The compiler balances sentence progress with corpus frequency instead of
  teaching raw frequency order. It expands inflections, assigns each corpus form
  to one lemma, and fails when authored sentence tokens cannot be resolved.
- Each word has independently scheduled FSRS skills: recognise, gender, listen,
  cloze, and produce. Gender is available immediately for nouns; the other skills
  unlock as recognition becomes stable and usable sentences become available.
- Word pronunciations are human recordings from the German Wiktionary project via
  Wikimedia Commons and are bundled for offline use. Sentences and stories use
  device speech synthesis.

## Progress backups

Open **Über → Your data** to export progress as a JSON file or import a backup on
another device. Imports validate the backup format, language, words, and review
data, then ask before replacing local progress. Export first to keep a copy of
your current progress. Backups include review history and scheduling data.

If loading or saving fails, the app displays an alert. Practice can continue in
memory, but export before leaving. A failed load never automatically overwrites
unread data, and a failed import or reset keeps the current progress in memory.

## Repository layout

```text
apps/web/          SvelteKit + adapter-static PWA and prerendered word pages
packages/engine/   Framework-free TypeScript engine and tests
data/              Lexicon, sentences, corpus, audio manifests, and compiler
```

## Development

Requires Node.js `>=22` and pnpm 10.

```sh
pnpm install
pnpm data        # compile data/dist/de.json and the web course data
pnpm dev         # http://localhost:5273
pnpm check       # Svelte check
pnpm test        # engine and storage tests; run pnpm data first
pnpm build       # compile data and build the static web app
pnpm preview     # preview the web build at http://localhost:5274
```

Run `pnpm data` after editing `data/de/lexicon.json`,
`data/de/sentences.json`, or the compiler. `pnpm build` invokes it
automatically. Pronunciation audio is already checked in; to refresh it, run
`pnpm data` first, then `pnpm data:audio` with `ffmpeg` available. The audio
fetch is resumable and optional because the app has speech-synthesis fallback.

## Deployment

Build the static assets and deploy them with the root Wrangler configuration:

```sh
pnpm build
pnpm deploy
```

## Licences and sources

- Application code: [MIT](LICENSE)
- Course content and compiled data: [CC BY-SA 4.0](data/LICENSE)
- Frequency source: [FrequencyWords](https://github.com/hermitdave/FrequencyWords)

The running app's `/ueber` page contains the method, source, and audio
attribution details.
