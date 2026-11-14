// Penyimpanan kunci–nilai kecil di IndexedDB (kapasitas besar, untuk foto bukti Scenario Test). Database sama dengan versi sebelumnya.
let dbp: Promise<IDBDatabase> | null = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  const rq = indexedDB.open('branchSync', 1);
  rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('kv')) rq.result.createObjectStore('kv'); };
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => { dbp = null; rej(rq.error); };
}));
const tx = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) => open().then(db => new Promise<T>((res, rej) => {
  const t = db.transaction('kv', mode), rq = fn(t.objectStore('kv'));
  t.oncomplete = () => res(rq.result as T);
  t.onerror = t.onabort = () => rej(t.error || rq.error);
}));
export const idbGet = <T,>(k: string) => tx<T | undefined>('readonly', s => s.get(k));
export const idbSet = (k: string, v: unknown) => tx<void>('readwrite', s => s.put(v, k));
