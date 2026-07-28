/**
 * A 40-line IndexedDB key/value store.
 *
 * localStorage would hold the progress object today, but it is synchronous and
 * capped at ~5 MB, and this has to survive a course with a thousand words per
 * language plus a review history. No dependency is worth adding for this.
 */

const DB = 'tausend';
const STORE = 'kv';

let handle: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (handle) return handle;
  handle = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return handle;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const get = <T>(key: string): Promise<T | undefined> =>
  tx('readonly', (store) => store.get(key) as IDBRequest<T | undefined>);

export const set = (key: string, value: unknown): Promise<IDBValidKey> =>
  tx('readwrite', (store) => store.put(value, key));

export const del = (key: string): Promise<undefined> =>
  tx('readwrite', (store) => store.delete(key) as IDBRequest<undefined>);
