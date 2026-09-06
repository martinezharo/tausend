import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportBackup, importBackup, validateProgress } from './backup.ts';
import { emptyProgress, review } from './scheduler.ts';

const ids = new Set(['haus']);
const sample = () => review(emptyProgress(), 'haus#recognise', 'good', new Date('2026-09-06T12:00:00.000Z'));

test('backup round trip preserves scheduling, history and empty progress', () => {
  for (const progress of [emptyProgress(), sample()]) {
    const restored = importBackup(exportBackup(progress, 'de'), 'de', ids);
    assert.deepEqual(restored, progress);
    assert.notEqual(restored, progress);
  }
});

test('rejects malformed files, unsupported formats and other languages', () => {
  for (const text of ['{', 'null', '{}', exportBackup(sample(), 'fr'),
    exportBackup(sample(), 'de').replace('"version": 1', '"version": 2')]) {
    assert.throws(() => importBackup(text, 'de', ids));
  }
});

test('rejects invalid cards and inconsistent references without changing input', () => {
  const mutations = [
    (p: any) => { p.cards['haus#recognise'].stability = Infinity; },
    (p: any) => { p.cards['haus#recognise'].state = 4; },
    (p: any) => { p.cards['haus#recognise'].due = '2026-02-30T00:00:00.000Z'; },
    (p: any) => { p.cards['haus#recognise'].reps = -1; },
    (p: any) => { p.introduced = ['unknown']; },
    (p: any) => { p.introduced.push('haus'); },
    (p: any) => { p.activeDays = ['2026-02-30']; },
    (p: any) => { p.answers[0].correct = 'yes'; },
    (p: any) => { p.answers[0].key = 'haus#invalid'; },
    (p: any) => { p.cards = JSON.parse('{"__proto__": {}}'); }
  ];
  for (const mutate of mutations) {
    const progress = sample();
    mutate(progress);
    const before = structuredClone(progress);
    assert.throws(() => validateProgress(progress, ids));
    assert.deepEqual(progress, before);
  }
});
