#!/usr/bin/env node
/**
 * Fetch real pronunciation audio from Wikimedia Commons.
 *
 *   node data/scripts/fetch-audio.mjs de
 *
 * Browser speech synthesis was a placeholder: the German voices shipped by
 * browsers are inconsistent across platforms and poor on iOS, and hearing the
 * language properly is load-bearing here rather than decorative.
 *
 * Commons hosts human recordings from the German Wiktionary pronunciation
 * project — every lemma in this course has one. They arrive as Ogg Vorbis at
 * wildly different loudness levels, so each is loudness-normalised and
 * transcoded to AAC/m4a. AAC rather than Opus because Safari on iOS is a
 * first-class target here and its Opus support is not dependable.
 *
 * Requires ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg).
 *
 * Every clip is CC-licensed and its author is recorded in data/<lang>/audio.json,
 * which the app renders on /ueber. Attribution is a licence condition, not a
 * courtesy — do not drop it.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const lang = process.argv[2] ?? 'de';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

const AUDIO_DIR = resolve(ROOT, `apps/web/static/audio/${lang}`);
const MANIFEST = resolve(ROOT, `data/${lang}/audio.json`);

const UA = {
  'User-Agent':
    'tausend-course-builder/0.1 (https://github.com/olivermartinez/tausend; open-source language course)'
};

const strip = (html) =>
  (html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Candidate Commons filenames, best first.
 *
 * `De-<lemma>.ogg` is the German Wiktionary pronunciation project's convention
 * and covers this course completely; the rest are regional or second-take
 * fallbacks for when a course grows past what that project recorded.
 */
const candidates = (lemma) => [
  `File:De-${lemma}.ogg`,
  `File:De-${lemma}2.ogg`,
  `File:De-at-${lemma}.ogg`,
  `File:De-${lemma}.wav`
];

/**
 * One batched Commons lookup, with backoff.
 *
 * Commons answers rate-limit violations with a plain-text body, not JSON, and
 * not with an HTTP error code either. Parsing that as "no results" silently
 * produced a course where 239 of 241 words had no audio and the build happily
 * reported success — so anything that is not a well-formed API response is a
 * hard failure here, retried and then surfaced.
 */
async function commonsLookup(titles, attempt = 0) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    '&iiprop=url|extmetadata|mime|size&titles=' +
    encodeURIComponent(titles.join('|'));

  const response = await fetch(url, { headers: UA });
  const text = await response.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    if (attempt >= 5) {
      throw new Error(
        `Commons refused the request after ${attempt} retries: ${text.slice(0, 120)}\n` +
          '  This is usually rate limiting. Wait a few minutes and run again — ' +
          'already-downloaded clips are skipped, so it resumes where it stopped.'
      );
    }
    const wait = 2000 * 2 ** attempt;
    process.stdout.write(`\n  throttled by Commons, backing off ${wait / 1000}s\n`);
    await sleep(wait);
    return commonsLookup(titles, attempt + 1);
  }

  if (!response.ok || body.error) {
    throw new Error(`Commons API error: ${body.error?.info ?? response.status}`);
  }

  const out = new Map();
  for (const page of Object.values(body.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    out.set(page.title, {
      title: page.title,
      url: info.url,
      descriptionUrl: info.descriptionurl,
      bytes: info.size,
      author: strip(meta.Artist?.value) || 'Unknown',
      licence: strip(meta.LicenseShortName?.value) || 'see Commons',
      licenceUrl: strip(meta.LicenseUrl?.value) || null
    });
  }
  return out;
}

// ---------------------------------------------------------------- resolve

const course = JSON.parse(readFileSync(resolve(ROOT, `data/dist/${lang}.json`), 'utf8'));

console.log(`\n  looking up ${course.words.length} pronunciations on Wikimedia Commons`);

const found = new Map();

/** Query one tier of candidate names, only for the words still unresolved. */
async function sweep(tier, label) {
  const pending = course.words.filter((w) => !candidates(w.lemma).some((c) => found.has(c)));
  if (!pending.length) return;

  const titles = pending.map((w) => candidates(w.lemma)[tier]).filter(Boolean);
  for (let i = 0; i < titles.length; i += 50) {
    const hits = await commonsLookup(titles.slice(i, i + 50));
    for (const [title, info] of hits) found.set(title, info);
    process.stdout.write(`\r  ${label}: ${Math.min(i + 50, titles.length)}/${titles.length}   `);
    await sleep(400);
  }
  process.stdout.write('\n');
}

// Tiered rather than all-at-once: the standard name resolves essentially the
// whole course, so the regional and second-take fallbacks only ever get asked
// about the handful that miss. Four times fewer requests, four times less
// chance of being throttled.
await sweep(0, 'standard    ');
await sweep(1, 'second take ');
await sweep(2, 'austrian    ');
await sweep(3, 'wav         ');

// ------------------------------------------------------- download + encode

mkdirSync(AUDIO_DIR, { recursive: true });

/**
 * Fetch one media file, backing off when Wikimedia says to.
 *
 * upload.wikimedia.org answers a burst with 429 and an HTML body. Treating
 * that as "this word has no recording" is how a first attempt at this script
 * produced 2 clips out of 241 and still exited 0 — a transport failure and an
 * absent recording are not the same thing and must not share a code path.
 *
 * @returns {Promise<Buffer|null>} null only when the file genuinely is not there.
 */
async function download(url, lemma, attempt = 0) {
  const response = await fetch(url, { headers: UA });

  if (response.ok) return Buffer.from(await response.arrayBuffer());
  if (response.status === 404) return null;

  if (attempt >= 6) {
    throw new Error(
      `giving up on ${lemma}: HTTP ${response.status} after ${attempt} retries.\n` +
        '  Wikimedia is throttling this host. Wait and run again — finished clips are skipped.'
    );
  }

  const retryAfter = Number(response.headers.get('retry-after'));
  const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 3000 * 2 ** attempt;
  process.stdout.write(`\n  HTTP ${response.status} on ${lemma}, waiting ${Math.round(wait / 1000)}s\n`);
  await sleep(wait);
  return download(url, lemma, attempt + 1);
}

let downloaded = 0;
let reused = 0;
const missing = [];
const entries = {};

for (const word of course.words) {
  const pick = candidates(word.lemma).map((c) => found.get(c)).find(Boolean);
  if (!pick) {
    missing.push(word.lemma);
    continue;
  }

  const file = `${word.slug}.m4a`;
  const out = resolve(AUDIO_DIR, file);

  if (existsSync(out) && statSync(out).size > 0) {
    reused++;
  } else {
    const buffer = await download(pick.url, word.lemma);
    if (!buffer) {
      missing.push(word.lemma);
      continue;
    }
    const temp = resolve(AUDIO_DIR, `.tmp-${word.slug}`);
    writeFileSync(temp, buffer);

    // Mono, 24 kHz, ~40 kbps is transparent for a single spoken word, and
    // loudness normalisation matters more than bitrate here: these are
    // volunteer recordings made on wildly different equipment, and a drill
    // that jumps 20 dB between cards is unusable on headphones.
    execFileSync(
      FFMPEG,
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', temp,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB',
        '-ac', '1', '-ar', '24000',
        '-c:a', 'aac', '-b:a', '40k',
        '-movflags', '+faststart',
        out
      ],
      { stdio: 'pipe' }
    );
    execFileSync('rm', ['-f', temp]);
    downloaded++;
    await sleep(900);
  }

  entries[word.slug] = {
    file,
    lemma: word.lemma,
    author: pick.author,
    licence: pick.licence,
    licenceUrl: pick.licenceUrl,
    source: pick.descriptionUrl
  };

  if ((downloaded + reused) % 25 === 0) {
    process.stdout.write(`\r  encoded ${downloaded + reused}/${course.words.length}`);
  }
}
process.stdout.write('\n');

const manifest = {
  language: lang,
  generatedAt: new Date().toISOString(),
  note:
    'Human pronunciation recordings from Wikimedia Commons, loudness-normalised and ' +
    'transcoded to AAC. Every entry keeps its author and licence: attribution is a ' +
    'condition of use, not a courtesy.',
  source: 'Wikimedia Commons',
  clips: entries
};

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

// ------------------------------------------------------------------ report

const total = Object.keys(entries).length;
const bytes = Object.values(entries).reduce(
  (n, e) => n + statSync(resolve(AUDIO_DIR, e.file)).size,
  0
);
const licences = {};
for (const e of Object.values(entries)) licences[e.licence] = (licences[e.licence] ?? 0) + 1;

console.log(`
  ${total}/${course.words.length} clips  (${downloaded} downloaded, ${reused} already present)
  ${(bytes / 1024).toFixed(0)} KB total, ${(bytes / total / 1024).toFixed(1)} KB average

  licences: ${Object.entries(licences).map(([l, n]) => `${l} ×${n}`).join(', ')}
  authors:  ${new Set(Object.values(entries).map((e) => e.author)).size} distinct contributors
${missing.length ? `\n  no recording found: ${missing.join(', ')}` : ''}
  → ${MANIFEST}
  → apps/web/static/audio/${lang}/

  Run \`pnpm data\` to fold the manifest into the compiled course.
`);
