#!/usr/bin/env node
/**
 * Course compiler.
 *
 *   node data/scripts/build-course.mjs de
 *
 * Reads the authored lexicon + sentences for a language, joins them against a
 * real frequency corpus, and emits a single compiled course JSON that the app
 * ships as static data.
 *
 * What it actually does, in order:
 *
 *   1. Expand every lemma into its surface forms (data/scripts/morph.mjs).
 *   2. Assign each corpus form to exactly one lemma, so coverage never
 *      double-counts. Sum those counts to get a real, corpus-derived rank.
 *   3. Tokenise every sentence and resolve each token back to a lemma,
 *      including preposition/article contractions and separable verbs whose
 *      prefix has flown to the end of the clause. FAIL on anything unresolved.
 *   4. Order the curriculum greedily: at each step take the word that unlocks
 *      the most new fully-known sentences, breaking ties by corpus frequency.
 *      This is what makes the course i+1 by construction rather than by hope.
 *   5. Emit the cumulative coverage curve, measured against the real corpus.
 *
 * Step 3 is the important one. If a sentence contains a word the learner has
 * not met, the build refuses to ship it — which is the only reason the
 * coverage number on the home screen can be trusted.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formsFor, splitSeparable, CONTRACTIONS } from './morph.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const lang = process.argv[2] ?? 'de';

/** When a surface form is claimed by several lemmas, this decides the winner. */
const POS_PRIORITY = ['det', 'pron', 'prep', 'conj', 'part', 'wh', 'verb', 'adv', 'num', 'adj', 'noun'];

/**
 * The one real trade-off in this course.
 *
 * High weight = pure frequency order = the coverage number climbs fastest, but
 * you cannot read a whole sentence for a very long time. Low weight = the
 * sequencer chases readable sentences and reward texts, and the headline
 * coverage number climbs more slowly.
 *
 * Measured on the German course (coverage at 25/50/100 words · story unlock
 * positions · sentences readable by word 50):
 *
 *      5    33.5 / 39.0 / 49.0   108 131 139   25
 *     80    36.8 / 43.0 / 54.2   113 148 154   24
 *    200    40.8 / 47.9 / 55.4   128 158 170   19   ← chosen
 *   1000    42.3 / 52.6 / 59.8   166 185 202    7
 *
 * 200 keeps essentially all of the early coverage that pure frequency ordering
 * buys, while nearly tripling how much real German is readable by word 50 and
 * pulling the reward texts forty words earlier. Override to re-measure:
 *
 *   FREQUENCY_WEIGHT=80 node data/scripts/build-course.mjs de
 */
const FREQUENCY_WEIGHT = Number(process.env.FREQUENCY_WEIGHT ?? 200);

const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const fail = (msg) => {
  console.error(`\n  build failed: ${msg}\n`);
  process.exit(1);
};

// ---------------------------------------------------------------- 1. inputs

const lexicon = read(`data/${lang}/lexicon.json`);

/**
 * Pronunciation clips, if data/scripts/fetch-audio.mjs has been run.
 *
 * Optional on purpose: a fresh clone can compile and run a complete course
 * without waiting on a few hundred network round-trips, and the app falls back
 * to speech synthesis for any word without a clip.
 */
let audio = { clips: {} };
try {
  audio = read(`data/${lang}/audio.json`);
} catch {
  console.warn(`\n  no data/${lang}/audio.json — build will fall back to speech synthesis`);
}
const corpusText = readFileSync(resolve(ROOT, `data/sources/${lang}_50k.txt`), 'utf8');
const sentenceFile = read(`data/${lang}/sentences.json`);

/** corpus: Map<lowercased form, occurrences> */
const corpus = new Map();
let corpusTotal = 0;
for (const line of corpusText.split('\n')) {
  const [form, n] = line.trim().split(/\s+/);
  if (!form || !n) continue;
  const count = Number(n);
  corpus.set(form, count);
  corpusTotal += count;
}

// -------------------------------------------------- 2. forms, owners, ranks

const words = lexicon.words.map((w) => ({
  id: `${lang}:${w.l.toLowerCase()}:${w.p}`,
  lemma: w.l,
  pos: w.p,
  gender: w.g ?? null,
  plural: w.pl ?? null,
  en: w.en,
  aux: w.aux ?? null,
  sep: w.sep ?? null,
  cognate: w.cog ?? null,
  falseFriend: w.ff ?? null,
  pattern: w.pat ?? null,
  note: w.note ?? null,
  forms: formsFor(w).filter((f) => !f.includes(' ')),
  multiwordForms: formsFor(w).filter((f) => f.includes(' '))
}));

const byId = new Map(words.map((w) => [w.id, w]));

/**
 * formOwner: Map<lowercased form, wordId>
 * Each surface form belongs to exactly one lemma. Without this, summing
 * frequencies over paradigms would count "die" once for der and again for
 * anything else that happens to generate it, and coverage would exceed 100%.
 */
const claims = new Map();
for (const w of words) {
  for (const f of w.forms) {
    const key = f.toLowerCase();
    if (!claims.has(key)) claims.set(key, []);
    claims.get(key).push(w);
  }
}

const formOwner = new Map();
for (const [form, candidates] of claims) {
  const winner = [...candidates].sort((a, b) => {
    // An exact lemma match always beats an inflected form of something else.
    const aExact = a.lemma.toLowerCase() === form ? 0 : 1;
    const bExact = b.lemma.toLowerCase() === form ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return POS_PRIORITY.indexOf(a.pos) - POS_PRIORITY.indexOf(b.pos);
  })[0];
  formOwner.set(form, winner.id);
}

// Corpus frequency per lemma, over the forms it exclusively owns.
const freq = new Map(words.map((w) => [w.id, 0]));
for (const [form, count] of corpus) {
  const owner = formOwner.get(form);
  if (owner) freq.set(owner, freq.get(owner) + count);
}
for (const w of words) w.corpusCount = freq.get(w.id);

// Rank = position in this course's own frequency ordering.
[...words]
  .sort((a, b) => b.corpusCount - a.corpusCount)
  .forEach((w, i) => {
    w.rank = i + 1;
  });

// ------------------------------------------- 3. resolve sentences to lemmas

/** Case-sensitive index, so "Morgen" (noun) and "morgen" (adverb) stay apart. */
const byExactForm = new Map();
for (const w of words) {
  for (const f of w.forms) {
    if (!byExactForm.has(f)) byExactForm.set(f, []);
    byExactForm.get(f).push(w);
  }
}

const pickBest = (cands, form) =>
  [...cands].sort((a, b) => {
    const aExact = a.lemma === form ? 0 : 1;
    const bExact = b.lemma === form ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const p = POS_PRIORITY.indexOf(a.pos) - POS_PRIORITY.indexOf(b.pos);
    if (p !== 0) return p;
    return b.corpusCount - a.corpusCount;
  })[0];

function lookup(token) {
  // Exact case first — this is what disambiguates German capitalised nouns.
  if (byExactForm.has(token)) return pickBest(byExactForm.get(token), token);
  const lower = token.charAt(0).toLowerCase() + token.slice(1);
  if (byExactForm.has(lower)) return pickBest(byExactForm.get(lower), lower);
  const upper = token.charAt(0).toUpperCase() + token.slice(1);
  if (byExactForm.has(upper)) return pickBest(byExactForm.get(upper), upper);
  return null;
}

/** Separable-verb patterns: authored two-word forms like "kommt an". */
const sepPatterns = [];
for (const w of words) {
  for (const mw of w.multiwordForms) {
    const parts = splitSeparable(mw);
    if (parts) sepPatterns.push({ stem: parts[0], prefix: parts[1], id: w.id });
  }
}

const properNouns = new Set(sentenceFile.allowProperNouns ?? []);
const tokenise = (s) =>
  s
    .replace(/[.,!?;:„“"()»«]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * @returns {{ids: string[], unresolved: string[]}}
 */
function resolveSentence(de) {
  const tokens = tokenise(de);
  const claimed = new Array(tokens.length).fill(null);

  // Separable verbs first: a stem followed later in the clause by its bare
  // prefix is one lemma, not two. Without this pass "Ich stehe ... auf"
  // resolves to stehen + the preposition auf, which is simply wrong.
  for (const { stem, prefix, id } of sepPatterns) {
    const i = tokens.findIndex((t, idx) => claimed[idx] === null && t.toLowerCase() === stem.toLowerCase());
    if (i === -1) continue;
    const j = tokens.findIndex((t, idx) => idx > i && claimed[idx] === null && t.toLowerCase() === prefix.toLowerCase());
    if (j === -1) continue;
    claimed[i] = id;
    claimed[j] = id;
  }

  const ids = [];
  const unresolved = [];
  tokens.forEach((token, idx) => {
    if (claimed[idx]) {
      ids.push(claimed[idx]);
      return;
    }
    if (properNouns.has(token)) return;

    // Preposition + article contractions expand into both lemmas.
    const contraction = CONTRACTIONS[token.toLowerCase()];
    if (contraction) {
      for (const lemma of contraction) {
        const hit = lookup(lemma);
        if (hit) ids.push(hit.id);
        else unresolved.push(token);
      }
      return;
    }

    const hit = lookup(token);
    if (hit) ids.push(hit.id);
    else unresolved.push(token);
  });

  return { ids: [...new Set(ids)], unresolved };
}

const problems = [];
const sentences = sentenceFile.sentences.map((s, i) => {
  const { ids, unresolved } = resolveSentence(s.de);
  if (unresolved.length) problems.push(`sentence "${s.de}" — unknown: ${unresolved.join(', ')}`);
  return { id: `s${i}`, de: s.de, en: s.en, words: ids, focus: s.focus ?? null };
});

const stories = sentenceFile.stories.map((st) => {
  const lines = st.lines.map((l) => {
    const { ids, unresolved } = resolveSentence(l.de);
    if (unresolved.length) problems.push(`story ${st.id} "${l.de}" — unknown: ${unresolved.join(', ')}`);
    return { de: l.de, en: l.en, words: ids };
  });
  return { id: st.id, title: st.title, enTitle: st.en_title, lines };
});

if (problems.length) {
  fail(
    `${problems.length} sentence(s) use vocabulary that is not in the lexicon.\n` +
      problems.map((p) => `    - ${p}`).join('\n') +
      `\n\n  Either add the word to data/${lang}/lexicon.json or rewrite the sentence.`
  );
}

// ------------------------------------------------------- 4. sequence greedily

/**
 * Greedy curriculum ordering.
 *
 * Ordering by raw frequency produces a course where you cannot build a single
 * whole sentence until word ~300. Instead, at every step we take the word that
 * turns the largest number of sentences from "one word missing" into "fully
 * known", and fall back to corpus frequency when nothing new unlocks.
 */
function sequence() {
  const remaining = new Set(words.map((w) => w.id));
  const known = new Set();
  const order = [];

  // Story lines count as sentences to unlock. Without this the sequencer
  // optimises for isolated example sentences and the reward texts — the whole
  // reason for the drilling — stay locked long past the point where the
  // learner has earned them.
  const pending = [
    ...sentences.map((s) => ({ id: s.id, need: new Set(s.words) })),
    ...stories.flatMap((st, i) =>
      st.lines.map((l, j) => ({ id: `${st.id}:${i}:${j}`, need: new Set(l.words) }))
    ),
    // Each story also counts as a single unit, so the sequencer is rewarded for
    // finishing a whole text and not just its individual lines.
    ...stories.map((st) => ({
      id: `story:${st.id}`,
      need: new Set(st.lines.flatMap((l) => l.words))
    }))
  ];

  while (remaining.size) {
    // How many words each pending item is still missing. Recomputed once per
    // pick rather than per candidate — this is the hot loop.
    const missingCount = pending.map((s) => {
      let missing = 0;
      for (const w of s.need) if (!known.has(w)) missing++;
      return missing;
    });

    let best = null;
    let bestScore = -Infinity;

    for (const id of remaining) {
      let unlocks = 0;
      for (let i = 0; i < pending.length; i++) {
        const missing = missingCount[i];
        if (missing === 0 || !pending[i].need.has(id)) continue;
        // Credit for *progress*, not only completion. Finishing an item scores
        // 1; halving a two-word gap scores 0.25; a distant item is worth almost
        // nothing. Counting completions alone made the sequencer myopic — it
        // would never invest in the cluster of low-frequency words that a
        // reward text needs, so the stories landed at the very end of the
        // course. The inverse square keeps early ordering frequency-driven.
        unlocks += 1 / (missing * missing);
      }
      const score = unlocks + (byId.get(id).corpusCount / corpusTotal) * FREQUENCY_WEIGHT;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }

    remaining.delete(best);
    known.add(best);
    order.push(best);
  }
  return order;
}

const order = sequence();
order.forEach((id, i) => {
  byId.get(id).order = i;
});

/** For each sentence/story, the curriculum position at which it becomes readable. */
const orderIndex = new Map(order.map((id, i) => [id, i]));
const unlockAt = (ids) => (ids.length ? Math.max(...ids.map((i) => orderIndex.get(i))) : 0);
for (const s of sentences) s.unlocksAt = unlockAt(s.words);
for (const st of stories) {
  st.unlocksAt = Math.max(...st.lines.map((l) => unlockAt(l.words)));
}

// ------------------------------------------------- 5. real coverage curve

/**
 * coverage[k] = share of all corpus tokens covered by the first k+1
 * curriculum words. This is measured, not estimated.
 */
const coverage = [];
let running = 0;
for (const id of order) {
  running += byId.get(id).corpusCount;
  coverage.push(Number((running / corpusTotal).toFixed(5)));
}

// The showcase text is deliberately outside the course vocabulary, so the
// coverage screen has something honest to fail at.
const showcase = {
  title: sentenceFile.showcase.title,
  enTitle: sentenceFile.showcase.en_title,
  tokens: tokenise(sentenceFile.showcase.text).map((raw, i) => {
    const punctuation = sentenceFile.showcase.text.match(new RegExp(`${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([.,!?;:])`));
    const hit = lookup(raw);
    return {
      i,
      text: raw + (punctuation ? punctuation[1] : ''),
      word: hit ? hit.id : null,
      order: hit ? byId.get(hit.id).order : null
    };
  })
};

// ------------------------------------------------------------- 6. emit

/**
 * URL slugs, disambiguated.
 *
 * German nominalises verbs freely, so `das Essen` / `essen` and `der Morgen` /
 * `morgen` are distinct lemmas that flatten to the same slug. Left alone they
 * silently overwrite each other's prerendered page. The more frequent lemma
 * keeps the bare slug and the other is suffixed with its part of speech.
 */
const baseSlug = (lemma) =>
  lemma.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

const slugCounts = new Map();
for (const w of words) {
  const base = baseSlug(w.lemma);
  slugCounts.set(base, (slugCounts.get(base) ?? 0) + 1);
}

const slugTaken = new Set();
for (const w of [...words].sort((a, b) => b.corpusCount - a.corpusCount)) {
  const base = baseSlug(w.lemma);
  if (slugCounts.get(base) === 1 || !slugTaken.has(base)) {
    w.slug = base;
    slugTaken.add(base);
  } else {
    w.slug = `${base}-${w.pos}`;
  }
}

const slugs = new Set(words.map((w) => w.slug));
if (slugs.size !== words.length) fail('slug collision survived disambiguation');

// No German word contains the same letter three times running. Anything that
// does came out of the morphology generator, not the language — and a bogus
// form silently pollutes the corpus frequency sum and the token resolver.
const artefacts = words.flatMap((w) =>
  w.forms.filter((f) => /(.)\1\1/.test(f)).map((f) => `${w.l ?? w.lemma} → ${f}`)
);
if (artefacts.length) {
  fail(
    `morphology produced ${artefacts.length} impossible form(s):\n` +
      artefacts.map((a) => `    - ${a}`).join('\n') +
      '\n\n  Fix the rule in data/scripts/morph.mjs, or add the correct forms to `f`.'
  );
}

const course = {
  language: lang,
  source: lexicon.source,
  builtAt: new Date().toISOString(),
  corpus: {
    name: 'OpenSubtitles 2018 (hermitdave/FrequencyWords)',
    licence: 'CC BY-SA 4.0',
    totalTokens: corpusTotal,
    distinctForms: corpus.size
  },
  words: order.map((id) => {
    const w = byId.get(id);
    return {
      id: w.id,
      lemma: w.lemma,
      pos: w.pos,
      gender: w.gender,
      plural: w.plural,
      en: w.en,
      forms: w.forms,
      aux: w.aux,
      sep: w.sep,
      cognate: w.cognate,
      falseFriend: w.falseFriend,
      pattern: w.pattern,
      note: w.note,
      rank: w.rank,
      order: w.order,
      corpusCount: w.corpusCount,
      slug: w.slug,
      audio: audio.clips[w.slug]?.file ?? null
    };
  }),
  sentences,
  stories,
  showcase,
  coverage
};

mkdirSync(resolve(ROOT, 'data/dist'), { recursive: true });
const out = resolve(ROOT, `data/dist/${lang}.json`);
writeFileSync(out, JSON.stringify(course));

const appData = resolve(ROOT, 'apps/web/src/lib/data');
mkdirSync(appData, { recursive: true });
writeFileSync(resolve(appData, `${lang}.json`), JSON.stringify(course));

// Audio credits ship separately from the course so the ~40 kB of attribution
// only loads on the page that renders it, not into every session.
if (Object.keys(audio.clips).length) {
  writeFileSync(resolve(appData, `audio-${lang}.json`), JSON.stringify(audio));
}

// ------------------------------------------------------------- report

const pct = (n) => `${(n * 100).toFixed(1)} %`;
const at = (k) => coverage[Math.min(k, coverage.length) - 1] ?? 0;
const nouns = course.words.filter((w) => w.pos === 'noun');

console.log(`
  ${lang.toUpperCase()} course compiled

  words           ${course.words.length}
  sentences       ${sentences.length}   (all vocabulary-checked)
  stories         ${stories.length}
  corpus          ${corpusTotal.toLocaleString('en-US')} tokens, ${corpus.size.toLocaleString('en-US')} distinct forms

  measured coverage of the corpus
    after  25     ${pct(at(25))}
    after  50     ${pct(at(50))}
    after 100     ${pct(at(100))}
    after 200     ${pct(at(200))}
    after ${String(course.words.length).padEnd(3)}     ${pct(at(course.words.length))}

  nouns with gender ${nouns.filter((w) => w.gender).length}/${nouns.length}
  first ten         ${course.words.slice(0, 10).map((w) => w.lemma).join(' ')}
  earliest sentence unlocks at position ${Math.min(...sentences.map((s) => s.unlocksAt)) + 1}

  → data/dist/${lang}.json
  → apps/web/src/lib/data/${lang}.json
`);
