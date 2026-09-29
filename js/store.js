// Lagring i nettleseren (IndexedDB): opptakene, lydfilene og innstillinger som ikke er tekst.
// Nettleseren kan rydde bort data etter lang tid uten bruk. Derfor bes det om varig lagring.

const DB_NAME = 'transkriber';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function run(storeName, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = action(store);
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const allItems = () => run('items', 'readonly', (s) => s.getAll());
export const getItem = (id) => run('items', 'readonly', (s) => s.get(id));
export const putItem = (item) => run('items', 'readwrite', (s) => s.put(item));
export const putAudio = (id, blob) => run('audio', 'readwrite', (s) => s.put({ id, blob }));
export const getAudio = async (id) => (await run('audio', 'readonly', (s) => s.get(id)))?.blob || null;

export async function deleteItem(id) {
  await run('items', 'readwrite', (s) => s.delete(id));
  await run('audio', 'readwrite', (s) => s.delete(id));
}

export const getKV = async (key) => (await run('kv', 'readonly', (s) => s.get(key)))?.value;
export const setKV = (key, value) => run('kv', 'readwrite', (s) => s.put({ key, value }));
export const deleteKV = (key) => run('kv', 'readwrite', (s) => s.delete(key));

/** Ber nettleseren om å ikke slette dataene av seg selv. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
}

/** Små innstillinger i localStorage. Tåler at lagringen er slått av. */
export function readSetting(key, fallback) {
  try {
    const raw = localStorage.getItem(`transkriber.${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeSetting(key, value) {
  try {
    localStorage.setItem(`transkriber.${key}`, JSON.stringify(value));
  } catch {
    // Privat modus eller full lagring: innstillingen gjelder bare denne gangen
  }
}
