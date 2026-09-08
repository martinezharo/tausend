import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, review } from './scheduler.ts';
import { practicePlan, practiceMatches } from './practice.ts';
import type { Exercise, Word } from './types.ts';

const word = { id: 'kaffee', lemma: 'Kaffee', gender: 'der' } as Word;
const produce: Exercise = { kind: 'produce', key: 'kaffee#produce', word, answer: 'Kaffee', prompt: 'coffee' };
const cloze: Exercise = {
  kind: 'cloze', key: 'kaffee#cloze', word, answer: 'Kaffee', options: ['Kaffee'],
  masked: 'Ich möchte einen ___.',
  sentence: { id: 'order', de: 'Ich möchte einen Kaffee.', en: 'I would like a coffee.', words: ['kaffee'], focus: null, unlocksAt: 0 }
};

test('new words have a complete letter bank including the article and duplicate letters', () => {
  const plan = practicePlan(produce, emptyProgress());
  assert.equal(plan.mode, 'letters');
  assert.deepEqual(plan.tokens, ['der ', 'K', 'a', 'f', 'f', 'e', 'e']);
  assert.equal(plan.tokens.join(''), plan.target);
});

test('new sentences start with every word supplied, never a blank writing prompt', () => {
  const plan = practicePlan(cloze, emptyProgress());
  assert.equal(plan.mode, 'words');
  assert.equal(plan.target, cloze.sentence.de);
  assert.equal(plan.tokens.join(' '), plan.target);
});

test('spaced practice moves from tiles through a hint to free recall', () => {
  const progress = review(emptyProgress(), produce.key, 'good');
  assert.equal(practicePlan(produce, progress).mode, 'letters');
  Object.assign(progress.cards[produce.key], { state: 2, reps: 2, stability: 3 });
  assert.equal(practicePlan(produce, progress).mode, 'hinted');
  assert.equal(practicePlan(produce, progress).hint, 'd＿＿ K＿＿＿＿＿');
  Object.assign(progress.cards[produce.key], { reps: 4, stability: 10 });
  assert.equal(practicePlan(produce, progress).mode, 'write');
  // Recognition of a word must not remove support from its sentence exercise.
  assert.equal(practicePlan(cloze, progress).mode, 'words');
});

test('many attempts alone cannot unlock unsupported writing, and a lapse restores tiles', () => {
  const progress = review(emptyProgress(), produce.key, 'again');
  Object.assign(progress.cards[produce.key], { reps: 20, stability: 20, state: 3 });
  assert.equal(practicePlan(produce, progress).mode, 'letters');
  Object.assign(progress.cards[produce.key], { state: 2, stability: 1 });
  assert.equal(practicePlan(produce, progress).mode, 'letters');
});

test('advanced sentence practice asks for the gap, not an entire sentence from memory', () => {
  const progress = review(emptyProgress(), cloze.key, 'good');
  Object.assign(progress.cards[cloze.key], { reps: 4, stability: 10, state: 2 });
  const plan = practicePlan(cloze, progress);
  assert.equal(plan.mode, 'write');
  assert.equal(plan.target, 'Kaffee');
});

test('sentence construction tolerates punctuation but requires word order and inflection', () => {
  assert.ok(practiceMatches(cloze.sentence.de, 'ich möchte einen Kaffee'));
  assert.ok(!practiceMatches(cloze.sentence.de, 'Ich einen Kaffee möchte.'));
  assert.ok(!practiceMatches(cloze.sentence.de, 'Ich möchte ein Kaffee.'));
});
