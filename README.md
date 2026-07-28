# Tausend

Learn the most frequent words of a language in the order that unlocks real
sentences fastest. German from English first; the engine is language-agnostic.

An offline-first PWA. No account, no server, no analytics.

---

## What it actually claims

The top thousand words cover a large share of running speech, but comprehension
needs around **95 %** lexical coverage and unassisted reading around **98 %**.
So this builds a skeleton, not fluency — and it says so on the home screen.

The coverage number is **measured**, not estimated: every word's corpus
frequency is summed over its full inflectional paradigm against 151.7 M tokens
of spoken German. The current German course reaches **66.5 %** with 241 words.

```
measured coverage of the corpus
  after  25     40.8 %
  after  50     47.9 %
  after 100     55.4 %
  after 241     66.5 %
```

## The two ideas worth stealing

**1. Teaching order is not frequency order.** Ordering by frequency alone means
you cannot read a whole sentence for a very long time. The compiler instead
picks, at each step, the word that makes the most progress toward completing
sentences and reward texts, with frequency as a competing term. The trade-off
is explicit and measured — see `FREQUENCY_WEIGHT` in
`data/scripts/build-course.mjs`.

**2. A word is not one flashcard.** Each word carries five independently
scheduled skills — recognise, gender, listen, cloze, produce — that unlock in a
ladder driven by measured FSRS stability rather than a repetition count. Gender
is the exception: it is available from first exposure and never gated, because
a wrong German article fossilises and exposure alone will not repair it.

## Layout

```
apps/web/          SvelteKit PWA, adapter-static. The trainer plus ~250
                   prerendered word pages.
packages/engine/   Framework-free TypeScript: FSRS scheduling, the skill
                   ladder, session assembly, coverage. 27 tests.
data/              Authored lexicon and sentences, the corpus, and the
                   compiler that joins them into a course.
```

The engine has no framework dependency on purpose: it makes the UI choice
reversible and puts the part that is actually hard under test.

## Getting started

```bash
pnpm install
pnpm data        # compile the course from data/de/*.json + the corpus
pnpm data:audio  # fetch pronunciations from Wikimedia Commons (needs ffmpeg)
pnpm dev         # http://localhost:5273
pnpm test        # engine tests
pnpm check       # svelte-check
pnpm build       # static site into apps/web/build
```

`pnpm data:audio` is resumable and only needs running once — clips already on
disk are skipped. Run `pnpm data` afterwards to fold the manifest into the
course. Audio is optional: without it the app falls back to speech synthesis.

`pnpm data` is not optional on a fresh clone — `apps/web/src/lib/data/de.json`
is a build artefact.

## How the course is compiled

`data/scripts/build-course.mjs`:

1. **Expand** every lemma into its surface forms. Regular morphology is
   generated (`morph.mjs`); irregular paradigms are authored in `lexicon.json`
   under `f`. The build refuses to ship impossible forms.
2. **Assign** each corpus form to exactly one lemma, so coverage never
   double-counts, then sum to get a real frequency rank.
3. **Resolve** every sentence token back to a lemma — including
   preposition/article contractions (`im`, `zur`) and separable verbs whose
   prefix has flown to the end of the clause (`Der Zug kommt … an`). **The build
   fails on any token it cannot resolve.** That check is what makes the i+1
   guarantee structural: a sentence can only be scheduled once every word in it
   is known.
4. **Sequence** as described above.
5. **Emit** the cumulative coverage curve, measured against the corpus.

Adding a language means writing `data/xx/lexicon.json` and
`data/xx/sentences.json` and running the compiler. Nothing in the app knows any
German.

## Adding or fixing a word

Edit `data/de/lexicon.json` and run `pnpm data`. The build will tell you if a
sentence now references vocabulary that does not exist, or if the morphology
rules produced something impossible. Fixing a bad gloss or a wrong plural is a
one-line pull request with no build environment required.

## Audio

Word pronunciations are **human recordings** from the German Wiktionary
pronunciation project, fetched from Wikimedia Commons and loudness-normalised
(volunteer recordings vary by 20 dB or more, which is unusable on headphones
when you hear twelve in a row). They are transcoded to AAC — not Opus, because
iOS Safari is a first-class target here — and precached with the app, so audio
works offline like everything else.

Each clip keeps its author and licence in `data/de/audio.json`, rendered on
`/ueber`. That attribution is a licence condition, not a courtesy.

## Design

Deliberate: German industrial signage. A road sign is designed to be read in
200 ms at 130 km/h, which is the same ergonomic problem as a flashcard glanced
at one-handed on a train.

Colour classifies rather than decorates — der/die/das own the palette. The
three are Signalblau, Magenta and Verkehrsgelb rather than blue/red/green so
they survive the red–green confusion that affects ~8 % of men, and each gender
carries a **second, non-colour channel** (left bar, top bar, underline) so the
classification never depends on hue alone.

Type is Archivo Variable throughout, exploiting the width axis so that `Haus`
and `Geschwindigkeitsbegrenzung` fill the same plate at the same optical weight.

## Known gaps

- **Sentence audio is synthetic.** Word pronunciations are real human
  recordings; the example sentences and texts have nobody to read them, so
  those buttons use device speech synthesis and are labelled as such.
- **241 words, not 1000.** The lexicon is hand-authored seed content. The
  Wiktionary/kaikki.org and Tatoeba stages of the pipeline are designed for but
  not yet wired up.
- **No sync.** Progress lives in IndexedDB on one device.
- The first session is a run of recognition exercises, because the opening
  words of the curriculum are function words with no gender and no sentence
  context yet. Variety arrives with the first nouns.

## Licence

Code **MIT** (`LICENSE`). Course content **CC BY-SA 4.0** (`data/LICENSE`) —
chosen deliberately so Wiktionary can be an upstream source for morphological
data. Frequency data from
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
(OpenSubtitles, CC BY-SA 4.0). Archivo and JetBrains Mono under the SIL OFL.
