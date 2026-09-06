import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Course, Progress } from './types.ts';
import { cardKey, emptyProgress, review, stabilityOf, knownWords, gradeFor } from './scheduler.ts';
import { applicableSkills, UNLOCK } from './skills.ts';
import { buildSession } from './session.ts';
import { buildExercise, checkAnswer, maskSentence } from './exercises.ts';
import { coverage, coverageAfter, showcase, nextStory } from './coverage.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const course: Course = JSON.parse(
  readFileSync(resolve(HERE, '../../../data/dist/de.json'), 'utf8')
);

const byLemma = (lemma: string) => {
  const w = course.words.find((x) => x.lemma === lemma);
  assert.ok(w, `lemma ${lemma} missing from the compiled course`);
  return w!;
};

/** Walk a card forward until it reaches at least `days` of stability. */
function stabilise(progress: Progress, key: string, days: number): Progress {
  let p = progress;
  let day = 0;
  while (stabilityOf(p, key) < days && day < 60) {
    p = review(p, key, 'easy', new Date(Date.UTC(2026, 0, 1 + day)));
    day += 3;
  }
  return p;
}

// ---------------------------------------------------------------- course data

test('the compiled course is present and non-trivial', () => {
  assert.ok(course.words.length > 200);
  assert.ok(course.sentences.length > 50);
  assert.equal(course.coverage.length, course.words.length);
});

test('every noun carries a gender and every sentence resolves to lemmas', () => {
  for (const w of course.words.filter((x) => x.pos === 'noun')) {
    assert.ok(w.gender, `${w.lemma} has no gender`);
  }
  const ids = new Set(course.words.map((w) => w.id));
  for (const s of course.sentences) {
    assert.ok(s.words.length > 0, `sentence "${s.de}" resolved to nothing`);
    for (const id of s.words) assert.ok(ids.has(id), `${s.de} references unknown ${id}`);
  }
});

test('every word has a unique slug', () => {
  // German nominalises verbs, so das Essen / essen and der Morgen / morgen
  // collide unless the compiler disambiguates. A collision silently drops a
  // prerendered page, which is invisible until someone links to it.
  const slugs = course.words.map((w) => w.slug);
  const seen = new Set<string>();
  const dupes = slugs.filter((s) => (seen.has(s) ? true : (seen.add(s), false)));
  assert.deepEqual(dupes, [], `duplicate slugs: ${dupes.join(', ')}`);
  assert.equal(seen.size, course.words.length);
});

test('sequencing unlocks sentences earlier than plain frequency order would', () => {
  // Under a pure frequency ordering, the first fully-readable sentence appears
  // only once its rarest word arrives. The greedy sequencer must beat that.
  const byOrder = new Map(course.words.map((w) => [w.id, w.order]));
  const byRank = new Map(course.words.map((w) => [w.id, w.rank]));

  const firstUnderCurriculum = Math.min(
    ...course.sentences.map((s) => Math.max(...s.words.map((w) => byOrder.get(w)!)))
  );
  const firstUnderFrequency = Math.min(
    ...course.sentences.map((s) => Math.max(...s.words.map((w) => byRank.get(w)!)))
  );

  assert.ok(
    firstUnderCurriculum < firstUnderFrequency,
    `curriculum ${firstUnderCurriculum} should unlock before frequency ${firstUnderFrequency}`
  );
});

test('reward texts unlock well before the end of the course', () => {
  // The stories are the payoff for the drilling. A purely greedy sequencer
  // optimises for isolated sentences and leaves them stranded in the last 15%
  // of the curriculum, where nobody reaches them.
  const byOrder = new Map(course.words.map((w) => [w.id, w.order]));
  const positions = course.stories
    .map((s) => Math.max(...s.lines.flatMap((l) => l.words).map((w) => byOrder.get(w)!)))
    .sort((a, b) => a - b);

  assert.equal(positions.length, course.stories.length);
  assert.ok(
    positions[0] < course.words.length * 0.6,
    `first story unlocks at word ${positions[0] + 1} of ${course.words.length} — too late to motivate anyone`
  );
  assert.ok(positions.at(-1)! < course.words.length * 0.85, 'the last story is stranded at the end');
});

test('audio filenames are consistent and unique when present', () => {
  // Audio is optional — a fresh clone compiles a working course before
  // fetch-audio.mjs has ever run — so this asserts the invariant rather than
  // the coverage. A clip pointing at the wrong slug would play the wrong word
  // and be very hard to notice.
  const withAudio = course.words.filter((w) => w.audio);
  const files = withAudio.map((w) => w.audio!);
  assert.equal(new Set(files).size, files.length, 'two words share one clip');

  for (const word of withAudio) {
    assert.equal(
      word.audio,
      `${word.slug}.m4a`,
      `${word.lemma} points at ${word.audio}, not its own slug`
    );
  }
});

test('the coverage curve is monotonic and honest about its ceiling', () => {
  for (let i = 1; i < course.coverage.length; i++) {
    assert.ok(course.coverage[i] >= course.coverage[i - 1], `coverage dipped at ${i}`);
  }
  const ceiling = course.coverage[course.coverage.length - 1];
  assert.ok(ceiling > 0.5, 'a few hundred words should clear half of running speech');
  assert.ok(ceiling < 0.95, 'this course must not claim comprehension it cannot deliver');
});

test('unlocksAt matches the last word each sentence needs', () => {
  const byOrder = new Map(course.words.map((w) => [w.id, w.order]));
  for (const s of course.sentences) {
    assert.equal(s.unlocksAt, Math.max(...s.words.map((w) => byOrder.get(w)!)));
  }
});

// ---------------------------------------------------------------- scheduling

test('a review pushes the due date out; forgetting a mature card counts as a lapse', () => {
  const now = new Date(Date.UTC(2026, 0, 1));
  const key = cardKey(byLemma('Haus').id, 'recognise');

  const good = review(emptyProgress(), key, 'good', now);
  assert.ok(new Date(good.cards[key].due).getTime() > now.getTime());

  // FSRS only counts a lapse once the card has graduated out of its learning
  // steps into Review (state 2); failing during learning just repeats a step.
  let mature = good;
  let day = 1;
  while (mature.cards[key].state !== 2 && day < 40) {
    mature = review(mature, key, 'good', new Date(Date.UTC(2026, 0, 1 + day)));
    day += 2;
  }
  assert.equal(mature.cards[key].state, 2, 'the card should reach Review state');
  assert.equal(mature.cards[key].lapses, 0);

  const lapsed = review(mature, key, 'again', new Date(Date.UTC(2026, 2, 1)));
  assert.equal(lapsed.cards[key].lapses, 1);
  assert.equal(lapsed.cards[key].state, 3, 'a failed review drops to Relearning');
});

test('review never mutates the progress it was given', () => {
  const before = emptyProgress();
  const key = cardKey(byLemma('Haus').id, 'recognise');
  const after = review(before, key, 'good');
  assert.equal(Object.keys(before.cards).length, 0);
  assert.equal(Object.keys(after.cards).length, 1);
  assert.deepEqual(before.introduced, []);
});

test('grading does not mistake fast taps or slow typing for memory strength', () => {
  assert.equal(gradeFor(false, 500), 'again');
  assert.equal(gradeFor(true, 1200), 'good');
  assert.equal(gradeFor(true, 4000), 'good');
  assert.equal(gradeFor(true, 9000), 'good');
});

// ------------------------------------------------------------- skill ladder

test('gender is available immediately, production is not', () => {
  const haus = byLemma('Haus');
  const skills = applicableSkills(haus, emptyProgress(), course, new Set());
  assert.ok(skills.includes('recognise'));
  assert.ok(skills.includes('gender'), 'gender must be attacked from first exposure');
  assert.ok(!skills.includes('produce'), 'production must not unlock cold');
  assert.ok(!skills.includes('listen'));
});

test('production unlocks only once recognition is stable and listening has happened', () => {
  const haus = byLemma('Haus');
  let p = emptyProgress();

  p = stabilise(p, cardKey(haus.id, 'recognise'), UNLOCK.produce);
  assert.ok(stabilityOf(p, cardKey(haus.id, 'recognise')) >= UNLOCK.produce);

  // Recognition alone is not enough — listening is a prerequisite.
  assert.ok(!applicableSkills(haus, p, course, new Set()).includes('produce'));

  p = review(p, cardKey(haus.id, 'listen'), 'good');
  assert.ok(applicableSkills(haus, p, course, new Set()).includes('produce'));
});

test('non-nouns never get a gender exercise', () => {
  const gehen = byLemma('gehen');
  assert.ok(!applicableSkills(gehen, emptyProgress(), course, new Set()).includes('gender'));
  assert.equal(buildExercise(gehen, 'gender', course, course.words, new Set(), () => 0.5), null);
});

// --------------------------------------------------------------- exercises

test('a cloze blanks the verb stem and leaves the separable prefix standing', () => {
  const ankommen = byLemma('ankommen');
  const sentence = course.sentences.find((s) => s.de.includes('kommt um acht Uhr an'));
  assert.ok(sentence, 'the separable-verb sentence should have survived the build');

  const masked = maskSentence(sentence!, ankommen);
  assert.ok(masked);
  assert.match(masked!.masked, /___/);
  assert.match(masked!.masked, /\ban\.?$/, 'the flown prefix must stay in the sentence');
  assert.equal(masked!.answer, 'kommt');
});

test('cloze exercises are only ever built from fully known sentences', () => {
  const rng = () => 0.42;
  // Know exactly the first 40 curriculum words.
  const known = new Set(course.words.slice(0, 40).map((w) => w.id));

  for (const word of course.words.slice(0, 40)) {
    const exercise = buildExercise(word, 'cloze', course, course.words, known, rng);
    if (!exercise || exercise.kind !== 'cloze') continue;
    for (const id of exercise.sentence.words) {
      assert.ok(known.has(id), `cloze for ${word.lemma} leaked unknown word ${id}`);
    }
  }
});

test('recognition offers the right answer among plausible distractors', () => {
  const haus = byLemma('Haus');
  const exercise = buildExercise(haus, 'recognise', course, course.words, new Set(), () => 0.3);
  assert.ok(exercise && exercise.kind === 'recognise');
  assert.equal(exercise.options.length, 4);
  assert.ok(exercise.options.includes('house'));
  assert.equal(new Set(exercise.options).size, 4, 'options must be distinct');
});

test('noun production requires the correct article while tolerating capitalisation', () => {
  const haus = byLemma('Haus');
  const exercise = buildExercise(haus, 'produce', course, course.words, new Set(), () => 0.5)!;
  assert.ok(!checkAnswer(exercise, 'Haus'));
  assert.ok(checkAnswer(exercise, 'das haus'));
  assert.ok(!checkAnswer(exercise, 'der Haus'));
  assert.ok(checkAnswer(exercise, 'das Haus'));
  assert.ok(!checkAnswer(exercise, 'Hause'));
});

// ----------------------------------------------------------------- sessions

test('a cold first session fills to the requested size', () => {
  // With no review backlog, `newWords` must act as a floor rather than a cap.
  // The first three curriculum words are der/ich/sein — none of them nouns, so
  // stopping at newWords ended the very first session after three questions.
  const session = buildSession(course, emptyProgress(), { size: 12, newWords: 3, seed: 7 });
  assert.equal(session.length, 12, `cold start produced only ${session.length} exercises`);
  const words = new Set(session.map((e) => e.word.id));
  assert.ok(words.size >= 6, 'a cold start should bring in several new words');
});

test('new material is capped once reviews are available to fill the session', () => {
  const now = new Date(Date.UTC(2026, 5, 1));
  let p = emptyProgress();
  for (const w of course.words.slice(0, 20)) {
    p = review(p, cardKey(w.id, 'recognise'), 'good', new Date(Date.UTC(2026, 0, 1)));
  }
  const known = new Set(p.introduced);
  const session = buildSession(course, p, { size: 12, newWords: 2, now, seed: 11 });
  const brandNew = new Set(session.filter((e) => !known.has(e.word.id)).map((e) => e.word.id));
  assert.ok(brandNew.size <= 3, `expected new words to stay capped, got ${brandNew.size}`);
  assert.equal(session.length, 12);
});

test('sessions are interleaved, not blocked by word', () => {
  const session = buildSession(course, emptyProgress(), { size: 12, newWords: 6, seed: 3 });
  let adjacentRepeats = 0;
  for (let i = 1; i < session.length; i++) {
    if (session[i].word.id === session[i - 1].word.id) adjacentRepeats++;
  }
  assert.equal(adjacentRepeats, 0, 'the same word must not appear twice in a row');
});

test('sessions are deterministic for a given seed', () => {
  const a = buildSession(course, emptyProgress(), { size: 10, seed: 99 });
  const b = buildSession(course, emptyProgress(), { size: 10, seed: 99 });
  assert.deepEqual(
    a.map((e) => e.key),
    b.map((e) => e.key)
  );
});

test('due reviews are preferred over new material', () => {
  const now = new Date(Date.UTC(2026, 5, 1));
  let p = emptyProgress();
  // Six words reviewed a long time ago, so they are all overdue.
  for (const w of course.words.slice(0, 6)) {
    p = review(p, cardKey(w.id, 'recognise'), 'good', new Date(Date.UTC(2026, 0, 1)));
  }
  const session = buildSession(course, p, { size: 8, newWords: 1, now, seed: 5 });
  const reviewed = session.filter((e) => p.cards[e.key]).length;
  assert.ok(reviewed >= 5, `expected mostly reviews, got ${reviewed} of ${session.length}`);
});

// ----------------------------------------------------------------- coverage

test('coverage rises as words become known and stays below the ceiling', () => {
  let p = emptyProgress();
  assert.equal(coverage(course, p).share, 0);

  for (const w of course.words.slice(0, 25)) {
    p = review(p, cardKey(w.id, 'recognise'), 'good');
  }

  const report = coverage(course, p);
  assert.equal(report.knownCount, 25);
  assert.ok(report.share > 0.3, `25 words should clear 30% of speech, got ${report.share}`);
  assert.ok(report.share <= report.ceiling);
  assert.ok(report.nextGain > 0);
});

test('coverageAfter agrees with the compiled curve', () => {
  assert.equal(coverageAfter(course, 0), 0);
  assert.equal(coverageAfter(course, 10), course.coverage[9]);
  assert.equal(coverageAfter(course, 10_000), course.coverage[course.coverage.length - 1]);
});

test('the showcase text keeps words outside the course permanently blocked', () => {
  let p = emptyProgress();
  for (const w of course.words) p = review(p, cardKey(w.id, 'recognise'), 'easy');

  const state = showcase(course, p);
  assert.ok(state.length > 20);
  const beyond = state.filter((t) => t.beyond);
  assert.ok(beyond.length > 0, 'the showcase must contain vocabulary the course does not teach');
  for (const token of beyond) assert.equal(token.known, false);
});

test('the next story reports exactly which words are still missing', () => {
  const next = nextStory(course, emptyProgress());
  assert.ok(next);
  assert.ok(next!.missing.length > 0);

  let p = emptyProgress();
  for (const w of next!.missing) p = review(p, cardKey(w.id, 'recognise'), 'good');
  const stillMissing = nextStory(course, p);
  assert.ok(
    !stillMissing || stillMissing.story.id !== next!.story.id,
    'learning every missing word should unlock that story'
  );
});

test('knownWords ignores words that were introduced but never actually graded', () => {
  const p: Progress = { ...emptyProgress(), introduced: [course.words[0].id] };
  assert.equal(knownWords(p, course.words).length, 0);
});
