import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { compileModule } from 'svelte/compiler';
import { IDBDatabase, IDBFactory } from 'fake-indexeddb';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('/progress.svelte.ts')) {
      return { format: 'module', shortCircuit: true,
        source: compileModule(stripTypeScriptTypes(readFileSync(new URL(url), 'utf8')), { filename: 'progress.svelte.ts', generate: 'client' }).js.code };
    }
    if (url.endsWith('/course.ts')) return { format: 'module', shortCircuit: true,
      source: 'export const course = { words: [{ id: "haus" }] };' };
    return next(url, context);
  }
});
const { ProgressStore } = await import('../src/lib/progress.svelte.ts');
const idb = await import('../src/lib/idb.ts');
const { emptyProgress, review } = await import('@tausend/engine');
globalThis.indexedDB = new IDBFactory();

function abortWrites() {
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const transaction = original.apply(this, args);
    if (args[1] === 'readwrite') {
      const store = transaction.objectStore('kv');
      for (const method of ['put', 'delete']) {
        const run = store[method].bind(store);
        store[method] = (...values) => {
          const request = run(...values);
          request.addEventListener('success', () => transaction.abort());
          return request;
        };
      }
    }
    return transaction;
  };
  return () => { IDBDatabase.prototype.transaction = original; };
}

test('storage and progress failure recovery', async () => {
  const originalOpen = indexedDB.open;
  indexedDB.open = () => { throw new Error('Unavailable'); };
  const unavailable = new ProgressStore();
  await unavailable.load();
  assert.match(unavailable.storageError, /could not be loaded/);
  indexedDB.open = originalOpen;

  const saved = review(emptyProgress(), 'haus#recognise', 'good');
  await idb.set('progress:de', saved);
  unavailable.record('haus#recognise', 'again');
  assert.deepEqual(await idb.get('progress:de'), saved, 'failed loads must not overwrite unread data');

  const store = new ProgressStore();
  await Promise.all([store.load(), store.load()]);
  assert.deepEqual(store.current, saved);
  const undo = abortWrites();
  try {
    await assert.rejects(idb.set('probe', 1), /abort/i);
    assert.equal(await idb.get('probe'), undefined);
    store.record('haus#recognise', 'again');
    await store.writes;
    assert.match(store.storageError, /could not be saved/);
    const inMemory = JSON.parse(JSON.stringify(store.current));
    await assert.rejects(store.restore(emptyProgress()));
    assert.deepEqual(store.current, inMemory);
    assert.match(store.storageError, /could not be saved/);
    await assert.rejects(store.reset());
    assert.deepEqual(store.current, inMemory);
  } finally { undo(); }
  store.record('haus#recognise', 'again');
  await store.restore(emptyProgress());
  assert.deepEqual(await idb.get('progress:de'), emptyProgress(), 'queued reviews cannot overwrite an import');
  assert.equal(store.storageError, '');
  await store.reset();
  assert.equal(await idb.get('progress:de'), undefined);
  await idb.set('progress:de', { broken: true });
  const corrupt = new ProgressStore();
  await corrupt.load();
  assert.match(corrupt.storageError, /could not be loaded/);
  corrupt.record('haus#recognise', 'good');
  assert.deepEqual(await idb.get('progress:de'), { broken: true });
  await corrupt.restore(saved);
  assert.deepEqual(corrupt.current, saved);
  assert.equal(corrupt.storageError, '');
});
