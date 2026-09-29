// Lagring av filer utenfor nettleseren.
// - Chrome og Edge på datamaskin: velg en mappe én gang, så lagres alt der av seg selv, som i Mac-appen.
// - Ellers: «Lagre …» per fil. På iPhone åpnes delingsarket, der «Arkiver i Filer» lar deg velge mappe.

import { getKV, setKV, deleteKV } from './store.js';
import { baseName, SUMMARY_SUFFIX } from './text.js';

export const canUseFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
let folder = null;

export async function loadFolder() {
  if (!canUseFolder) return null;
  try {
    folder = (await getKV('folder')) || null;
  } catch {
    folder = null;
  }
  return folderInfo();
}

export async function folderInfo() {
  if (!folder) return null;
  let granted = false;
  try {
    granted = (await folder.queryPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    granted = false;
  }
  return { name: folder.name, granted };
}

/** Må kalles direkte fra et trykk. */
export async function chooseFolder() {
  const handle = await window.showDirectoryPicker({ id: 'transkriber', mode: 'readwrite' });
  folder = handle;
  await setKV('folder', handle);
  return folderInfo();
}

/** Nettleseren spør om tilgang på nytt etter omstart. Må kalles direkte fra et trykk. */
export async function grantFolder() {
  if (!folder) return null;
  try {
    await folder.requestPermission({ mode: 'readwrite' });
  } catch {
    // Brukeren sa nei
  }
  return folderInfo();
}

export async function forgetFolder() {
  folder = null;
  await deleteKV('folder');
  return null;
}

async function writableFolder() {
  if (!folder) return null;
  try {
    return (await folder.queryPermission({ mode: 'readwrite' })) === 'granted' ? folder : null;
  } catch {
    return null;
  }
}

async function exists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function writeFile(dir, name, data) {
  const handle = await dir.getFileHandle(name, { create: true });
  const stream = await handle.createWritable();
  await stream.write(data);
  await stream.close();
}

async function removeFile(dir, name) {
  try {
    await dir.removeEntry(name);
  } catch {
    // Fantes ikke
  }
}

/**
 * Skriver lyd, tekst og oppsummering til den valgte mappen, med tidspunktet først i navnet.
 * Endres tittelen, får filene nytt navn. Returnerer filnavnene, eller null hvis mappen ikke kan brukes nå.
 */
export async function syncItem(item, { audio = null, text = null, summary = null }) {
  const root = await writableFolder();
  if (!root) return null;
  const inSession = item.source === 'recording' && item.sessionFolder;
  const dir = inSession ? await root.getDirectoryHandle(item.sessionFolder, { create: true }) : root;
  const old = item.files || {};
  const own = new Set([old.audio, old.text, old.summary].filter(Boolean));
  const withAudio = audio && item.source === 'recording';

  const namesFor = (name) => [
    withAudio ? `${name}.${item.audioExt}` : null,
    text !== null ? `${name}.txt` : null,
    summary !== null ? `${name}${SUMMARY_SUFFIX}` : null,
  ].filter(Boolean);

  // Samme navn som en annen fil? Da får dette opptaket (2), (3) …
  const base = baseName(item.createdAt, item.title);
  let name = base;
  for (let n = 2; ; n++) {
    let taken = false;
    for (const candidate of namesFor(name)) {
      if (!own.has(candidate) && (await exists(dir, candidate))) { taken = true; break; }
    }
    if (!taken) break;
    name = `${base} (${n})`;
  }

  const files = { dir: inSession ? item.sessionFolder : '' };
  if (withAudio) {
    const target = `${name}.${item.audioExt}`;
    if (target !== old.audio || !(await exists(dir, target))) await writeFile(dir, target, audio);
    if (old.audio && old.audio !== target) await removeFile(dir, old.audio);
    files.audio = target;
  }
  if (text !== null) {
    const target = `${name}.txt`;
    await writeFile(dir, target, text);
    if (old.text && old.text !== target) await removeFile(dir, old.text);
    files.text = target;
  }
  if (summary !== null) {
    const target = `${name}${SUMMARY_SUFFIX}`;
    await writeFile(dir, target, summary);
    if (old.summary && old.summary !== target) await removeFile(dir, old.summary);
    files.summary = target;
  }
  return files;
}

// MARK: «Lagre …»

function pickerType(name, type) {
  if (name.endsWith('.txt')) return { description: 'Tekst', accept: { 'text/plain': ['.txt'] } };
  const ext = `.${name.split('.').pop()}`;
  return { description: 'Lyd', accept: { [(type || 'audio/*').split(';')[0].trim() || 'audio/*']: [ext] } };
}

/**
 * Lar deg velge hvor filene skal lagres. `files` er [{ name, blob }].
 * Returnerer 'saved', 'shared', 'downloaded' eller 'cancelled'.
 */
export async function saveFiles(files) {
  try {
    if (files.length === 1 && 'showSaveFilePicker' in window) {
      const [file] = files;
      const handle = await window.showSaveFilePicker({
        suggestedName: file.name,
        id: 'transkriber-lagre',
        types: [pickerType(file.name, file.blob.type)],
      });
      const stream = await handle.createWritable();
      await stream.write(file.blob);
      await stream.close();
      return 'saved';
    }
    if (files.length > 1 && 'showDirectoryPicker' in window) {
      const dir = await window.showDirectoryPicker({ id: 'transkriber-lagre', mode: 'readwrite' });
      for (const file of files) await writeFile(dir, file.name, file.blob);
      return 'saved';
    }
    const shareable = files.map((f) => new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }));
    if (navigator.canShare?.({ files: shareable })) {
      await navigator.share({ files: shareable });
      return 'shared';
    }
    for (const file of files) {
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      await new Promise((r) => setTimeout(r, 250));
    }
    return 'downloaded';
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
