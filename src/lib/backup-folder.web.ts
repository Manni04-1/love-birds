// On the web the browser asks for a folder each visit, through its own folder picker.
// Only some browsers have one; the others are told to use the app on the phone.

/** The folder a backup goes into, remembered between backups, with its photos and voice folders once made. */
export type FolderRef = { uri: string; photos?: string; voice?: string };
export type Kind = 'photos' | 'voice';

/** An open backup folder. */
export type BackupFolder = {
  ref: FolderRef;
  has: (kind: Kind, name: string) => boolean;
  writeText: (name: string, text: string) => Promise<void>;
  saveFromUrl: (kind: Kind, name: string, url: string) => Promise<boolean>;
  finish: () => void;
};

/** The folder was deleted, or Love Birds can't reach it any more. */
export class FolderGone extends Error {
  constructor() {
    super('Love Birds can’t reach that folder any more. Choose a folder to save the backup in.');
  }
}

type Writable = { write: (data: Blob | string) => Promise<void>; close: () => Promise<void> };
type FileHandle = { createWritable: () => Promise<Writable> };
type DirHandle = {
  name: string;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandle>;
  keys: () => AsyncIterable<string>;
};
type Picker = (options?: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<DirHandle>;

let picked: DirHandle | null = null;

/** Opens the browser's folder picker. Null if you back out. */
export async function pickFolder(): Promise<FolderRef | null> {
  const show = (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  if (!show) throw new Error('Backups work in the Love Birds app on your phone.');
  try {
    picked = await show({ id: 'love-birds-backup', mode: 'readwrite', startIn: 'documents' });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return null;
    throw e;
  }
  return { uri: `web:${picked.name}` };
}

export function folderLabel(ref: FolderRef): string {
  return ref.uri.replace(/^web:/, '') || 'the folder you chose';
}

async function namesIn(dir: DirHandle): Promise<Set<string>> {
  const names = new Set<string>();
  for await (const name of dir.keys()) names.add(name);
  return names;
}

async function put(dir: DirHandle, name: string, data: Blob | string) {
  const out = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await out.write(data);
  await out.close();
}

export async function openFolder(ref: FolderRef): Promise<BackupFolder> {
  const root = picked;
  if (!root || ref.uri !== `web:${root.name}`) throw new FolderGone();
  const dirs = { photos: await root.getDirectoryHandle('photos', { create: true }), voice: await root.getDirectoryHandle('voice', { create: true }) };
  const names = { photos: await namesIn(dirs.photos), voice: await namesIn(dirs.voice) };
  return {
    ref: { uri: ref.uri },
    has: (kind, name) => names[kind].has(name),
    writeText: (name, text) => put(root, name, text),
    async saveFromUrl(kind, name, url) {
      if (names[kind].has(name)) return false;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Unable to download a file: response has status: ${res.status}`);
      await put(dirs[kind], name, await res.blob());
      names[kind].add(name);
      return true;
    },
    finish() {},
  };
}
