# Tausend

German for real life: an offline-first learning app with practical expressions,
independent listening and recall schedules, and a searchable phrasebook. Progress
stays in IndexedDB on the device. No account or application server is required.

## Learning experience

- **101 expressions across 10 situations:** courtesy, introductions, conversation
  repair, numbers, days and arrangements, colours, cafés, shops, travel and help.
  All topics are available immediately.
- **Understand before being tested:** new expressions include a translation and a
  short teaching note, then recognition and written recall in the same session.
- **Personal review:** FSRS schedules recognition, production and listening
  separately. Due expressions from other topics return alongside the selected
  topic. Sessions introduce at most four new expressions and select up to eight
  due reviews. Failed answers return up to twice within the session; successful
  immediate retries do not artificially increase long-term stability.
- **Useful feedback:** explicit correct/incorrect panels, optional answer sounds,
  accepted authored alternatives, German character keys and ae/oe/ue/ss input.
  Answer speed does not determine memory strength.
- **Speaking:** record up to 15 seconds, replay and compare with the example.
  Recordings stay in browser memory and are discarded on leaving the exercise.
  This is self-practice, not automated pronunciation assessment.
- **Reference:** search the phrasebook without starting practice. The existing
  241-word dictionary, 80 sentences, 3 stories and word workout remain available.

Topics reflect everyday beginner needs in the
[Goethe-Institut A1 overview](https://www.goethe.de/ins/de/en/prf/prf/gzsd1.html).
The course is original content and is not a complete A1 qualification.

## Audio

Dictionary words use bundled human Wiktionary recordings where available. Phrases,
sentences and inflected forms use German device speech synthesis. **Settings &
learning → Audio & sound** selects a voice; automatic selection prefers enhanced
German voices when provided by the device. Slow playback is available in practice.
The spoken text matches the displayed phrase, including conjugations and plurals.

There is no paid neural speech service or API key. Synthesis quality and offline
availability depend on installed voices; online voices may send example text to
the platform's speech provider. Listening sessions are excluded when no German
voice is available. Microphone recording requires a supported secure browser and
explicit microphone permission. Reading, writing and bundled clips work offline
after the PWA has cached its assets.

## Progress backups

Open **Settings & data → Your data** to export or import JSON progress. Backups
include both dictionary and practical-course schedules and history. Existing
word-only backups remain supported. Imports validate before replacement and ask
before replacing current progress. Export first to keep a copy.

If loading or saving fails, an alert explains the situation. Practice can continue
in memory; export before leaving. Failed loading never overwrites unread data.
The daily goal counts scheduled answers, not immediate correction repetitions.

## Repository layout

```text
apps/web/                         SvelteKit static PWA
packages/engine/src/practical.ts   Authored situations and practical session selection
packages/engine/                  Framework-free learning engine and tests
data/                             Dictionary, sentences, corpus and audio compiler
e2e/                              Browser session and persistence regressions
```

## Development

Requires Node.js >=22.18.0 and pnpm 10.

```sh
pnpm install
pnpm dev       # http://localhost:5273
pnpm check
pnpm test
pnpm build     # compiles dictionary data and builds the PWA
pnpm preview   # http://localhost:5274
pnpm exec playwright install chromium
pnpm test:e2e  # tests the production build; run pnpm build first
```

To use an existing browser binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when
running `pnpm test:e2e`. No machine-specific browser path is committed.

Edit practical content in `packages/engine/src/practical.ts`; phrase IDs are stable
storage identifiers and must not be reassigned. Edit dictionary content in
`data/de/lexicon.json` and `data/de/sentences.json`, then run `pnpm data`.
`pnpm data:audio` refreshes dictionary audio with ffmpeg installed.

## Deployment

```sh
pnpm build
pnpm run deploy
```

Deployment uses `apps/web/wrangler.jsonc` and uploads static assets to the existing
Cloudflare Worker. All runtime state belongs to the learner's device; the app can
be built on another machine without migrating server-side user data.

## Licences and sources

- Application code: [MIT](LICENSE)
- Course content and compiled data: [CC BY-SA 4.0](data/LICENSE)
- Dictionary frequency source: [FrequencyWords](https://github.com/hermitdave/FrequencyWords)
- Human audio: Wikimedia Commons, with per-clip attribution on `/ueber`
