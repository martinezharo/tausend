#!/usr/bin/env node
/**
 * Pre-render every line the app would otherwise hand to the browser's speech
 * synthesiser.
 *
 *   node data/scripts/synth-audio.mjs de
 *
 * Words are human recordings (see fetch-audio.mjs). Everything else — example
 * sentences, story lines, the inflected tokens a learner taps into a sentence,
 * the letters of a word being spelled out — has no recording, and leaving it
 * to `speechSynthesis` made the course sound different on every machine: a
 * different voice per word as the browser's voice list loaded in, and on a
 * device with no German voice, German read with the local locale's accent.
 *
 * The text is small, fixed and authored — 80 sentences, three stories, thirty
 * letter names — so it is rendered once here instead. Everyone then hears the
 * same voice, and a tapped letter sounds instantly rather than after a network
 * round trip.
 *
 * Piper (MIT) with de_DE-thorsten-high, finetuned on the Thorsten-Voice
 * corpus that Thorsten Müller released as CC0:
 * https://github.com/thorstenMueller/Thorsten-Voice
 *
 * Both the venv and the voice model are created on first run under data/, and
 * neither is committed.
 *
 * Requires python3 and ffmpeg on PATH (FFMPEG=/path/to/ffmpeg to override).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

import { LETTER_NAMES } from '../../apps/web/src/lib/alphabet.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const lang = process.argv[2] ?? 'de';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

const VOICE = 'de_DE-thorsten-high';
const VENV = resolve(ROOT, 'data/.venv');
const PYTHON = resolve(VENV, 'bin/python');
const VOICES = resolve(ROOT, 'data/.voices');
const MODEL = resolve(VOICES, `${VOICE}.onnx`);

const OUT_DIR = resolve(ROOT, `apps/web/static/audio/${lang}/tts`);
const MANIFEST = resolve(ROOT, `apps/web/src/lib/data/tts-${lang}.json`);

const course = JSON.parse(readFileSync(resolve(ROOT, `data/dist/${lang}.json`), 'utf8'));

// --------------------------------------------------------------- what to say

/**
 * Strip only the edges: "geht's" is one word, and "gehts" is not how it
 * sounds. Kept identical to `playToken` in the app, which looks clips up by
 * exactly this string.
 */
const bare = (token) => token.trim().replace(/^[.,!?;:„“”"'…]+|[.,!?;:„“”"'…]+$/g, '');

/** Lemmas that already have a human recording; those must never be re-voiced. */
const recorded = new Set(
  course.words.filter((word) => word.audio).map((word) => word.lemma.toLowerCase())
);

const texts = new Set();
const want = (text) => {
  const trimmed = (text ?? '').trim();
  if (trimmed) texts.add(trimmed);
};

// Sentences, whole, as the cloze card and every sentence's speaker button say them.
for (const sentence of course.sentences) want(sentence.de);

// The tiles of a sentence being assembled. A token that is exactly a recorded
// lemma plays its recording instead, so it needs nothing here.
for (const sentence of course.sentences) {
  for (const token of sentence.de.split(/\s+/)) {
    const text = bare(token);
    if (text && !recorded.has(text.toLowerCase())) want(text);
  }
}

// Stories, line by line and whole, matching both buttons on the story page.
for (const story of course.stories) {
  for (const line of story.lines) want(line.de);
  want(story.lines.map((line) => line.de).join(' '));
}

// Plurals, for the button next to a noun's plural form on its word page.
for (const word of course.words) if (word.plural) want(`die ${word.plural}`);

// Letter names, for a word being spelled out tile by tile.
for (const name of Object.values(LETTER_NAMES)) want(name);

/**
 * Content-addressed, so editing a sentence orphans its clip rather than
 * reusing it. The voice is part of what is hashed: without it, switching
 * voices would leave every filename unchanged, every clip would look already
 * rendered, and the course would keep the old voice in silence.
 */
const nameFor = (text) =>
  `${createHash('sha1').update(`${VOICE}\n${text}`).digest('hex').slice(0, 10)}.m4a`;

const wanted = new Map([...texts].sort().map((text) => [text, nameFor(text)]));

// --------------------------------------------------------------- provisioning

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: 'inherit', ...options });
}

function provision() {
  if (!existsSync(PYTHON)) {
    console.log('  creating data/.venv');
    run('python3', ['-m', 'venv', VENV]);
    run(PYTHON, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip']);
  }
  try {
    execFileSync(PYTHON, ['-c', 'import piper'], { stdio: 'pipe' });
  } catch {
    console.log('  installing piper-tts');
    run(PYTHON, ['-m', 'pip', 'install', '--quiet', 'piper-tts']);
  }
  if (!existsSync(MODEL)) {
    console.log(`  downloading ${VOICE}`);
    mkdirSync(VOICES, { recursive: true });
    run(PYTHON, ['-m', 'piper.download_voices', VOICE, '--data-dir', VOICES]);
  }
  try {
    execFileSync(FFMPEG, ['-version'], { stdio: 'pipe' });
  } catch {
    console.error(`\n  ffmpeg not found (tried "${FFMPEG}"). Install it, or set FFMPEG.\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- rendering

mkdirSync(OUT_DIR, { recursive: true });

const missing = [...wanted].filter(([, file]) => !existsSync(resolve(OUT_DIR, file)));

if (missing.length) {
  provision();

  const scratch = resolve(tmpdir(), `tausend-tts-${process.pid}`);
  mkdirSync(scratch, { recursive: true });

  const jobs = missing.map(([text, file]) => ({ text, out: resolve(scratch, `${file}.wav`) }));
  console.log(`  synthesising ${jobs.length} clips with ${VOICE}`);
  execFileSync(PYTHON, [resolve(HERE, 'piper-render.py'), MODEL], {
    input: JSON.stringify(jobs),
    stdio: ['pipe', 'inherit', 'inherit']
  });

  for (const [index, [, file]] of missing.entries()) {
    // The same treatment the human recordings get, and for the same reason:
    // a drill that jumps in volume between a recorded word and a synthesised
    // sentence is unpleasant on headphones. Mono/24 kHz/40 kbps is
    // transparent for speech.
    execFileSync(
      FFMPEG,
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', resolve(scratch, `${file}.wav`),
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB',
        '-ac', '1', '-ar', '24000',
        '-c:a', 'aac', '-b:a', '40k',
        '-movflags', '+faststart',
        resolve(OUT_DIR, file)
      ],
      { stdio: 'pipe' }
    );
    if ((index + 1) % 25 === 0) process.stdout.write(`\r  encoded ${index + 1}/${missing.length}`);
  }
  process.stdout.write(`\r  encoded ${missing.length}/${missing.length}\n`);
  rmSync(scratch, { recursive: true, force: true });
}

// ------------------------------------------------------------------ manifest

const keep = new Set(wanted.values());
let pruned = 0;
for (const file of readdirSync(OUT_DIR)) {
  if (keep.has(file)) continue;
  rmSync(resolve(OUT_DIR, file));
  pruned++;
}

// Sorted so a rebuild that changes nothing produces no diff.
writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(wanted), null, 0) + '\n');

const bytes = [...keep].reduce(
  (total, file) => total + readFileSync(resolve(OUT_DIR, file)).byteLength,
  0
);

console.log(`
  voice     ${VOICE} (Piper, MIT; corpus CC0)
  clips     ${wanted.size} (${missing.length} new, ${pruned} pruned)
  size      ${(bytes / 1024 / 1024).toFixed(1)} MB
  → apps/web/static/audio/${lang}/tts/
  → apps/web/src/lib/data/tts-${lang}.json
`);
