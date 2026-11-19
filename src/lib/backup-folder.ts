import { Directory, File, Paths } from 'expo-file-system';

import { whileAway } from './lock';

/** The folder a backup goes into, remembered between backups, with its photos and voice folders once made. */
export type FolderRef = { uri: string; photos?: string; voice?: string };
export type Kind = 'photos' | 'voice';

/** An open backup folder. */
export type BackupFolder = {
  /** The folder and its photos and voice folders, to remember for next time. */
  ref: FolderRef;
  /** True when a photo or voice note of this name is already in the folder. */
  has: (kind: Kind, name: string) => boolean;
  /** Writes a file at the top of the folder, replacing the one from the last backup. */
  writeText: (name: string, text: string) => Promise<void>;
  /** Downloads a photo or voice note into its folder. False when it was there already. */
  saveFromUrl: (kind: Kind, name: string, url: string) => Promise<boolean>;
  /** Clears the copies kept in the app while saving. */
  finish: () => void;
};

/** The folder was deleted, or Love Birds can't reach it any more. */
export class FolderGone extends Error {
  constructor() {
    super('Love Birds can’t reach that folder any more. Choose a folder to save the backup in.');
  }
}

// The picker opens in the phone's Documents folder.
const DOCUMENTS = 'content://com.android.externalstorage.documents/document/primary%3ADocuments';

/** Opens the phone's folder picker. Null if you back out. */
export async function pickFolder(): Promise<FolderRef | null> {
  try {
    const dir = await whileAway(() => Directory.pickDirectoryAsync(DOCUMENTS));
    return { uri: dir.uri };
  } catch (e) {
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return null;
    throw e;
  }
}

/** The folder's place on the phone, such as "Documents/Love Birds", read from its link. */
export function folderLabel(ref: FolderRef): string {
  try {
    const tree = decodeURIComponent(ref.uri).split('/tree/')[1]?.split('/document/')[0] ?? '';
    const parts = tree.slice(tree.indexOf(':') + 1).split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last || /^\d+$/.test(last)) return 'the folder you chose';
    return parts.slice(-2).join('/');
  } catch {
    return 'the folder you chose';
  }
}

/** A file or folder's name, read from its link. Empty when the link doesn't show it. */
function nameOf(uri: string): string {
  try {
    const doc = decodeURIComponent(uri.replace(/\/+$/, '')).split('/document/').pop() ?? '';
    return doc.split(/[/:]/).pop() ?? '';
  } catch {
    return '';
  }
}

function existing(uri: string | undefined): Directory | null {
  if (!uri) return null;
  try {
    const dir = new Directory(uri);
    return dir.exists ? dir : null;
  } catch {
    return null;
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Opens the folder you picked, making its photos and voice folders the first time. */
export async function openFolder(ref: FolderRef): Promise<BackupFolder> {
  const root = existing(ref.uri);
  if (!root) throw new FolderGone();
  let top: (Directory | File)[];
  try {
    top = root.list();
  } catch {
    throw new FolderGone();
  }

  // Remembered links come first: on some phones a link doesn't show the folder's name.
  const inside = (kind: Kind): Directory =>
    existing(ref[kind]) ?? (top.find((e) => e instanceof Directory && nameOf(e.uri) === kind) as Directory | undefined) ?? root.createDirectory(kind);
  const dirs: Record<Kind, Directory> = { photos: inside('photos'), voice: inside('voice') };
  const names: Record<Kind, Set<string>> = {
    photos: new Set(dirs.photos.list().map((e) => nameOf(e.uri))),
    voice: new Set(dirs.voice.list().map((e) => nameOf(e.uri))),
  };

  const temp = new Directory(Paths.cache, 'love-birds-backup');
  temp.create({ intermediates: true, idempotent: true });

  const drop = (file: File) => {
    try {
      if (file.exists) file.delete();
    } catch {
      // The phone clears its cache folder by itself in the end.
    }
  };

  return {
    ref: { uri: ref.uri, photos: dirs.photos.uri, voice: dirs.voice.uri },
    has: (kind, name) => names[kind].has(name),
    async writeText(name, text) {
      const file = new File(temp, name);
      try {
        await file.write(text);
        await file.copy(root, { overwrite: true });
      } finally {
        drop(file);
      }
    },
    async saveFromUrl(kind, name, url) {
      if (names[kind].has(name)) return false;
      const file = new File(temp, name);
      try {
        await File.downloadFileAsync(url, file, { idempotent: true });
        await file.copy(dirs[kind]);
      } catch (e) {
        // Already there, under a link that didn't show its name.
        if (/already exists/i.test(message(e))) {
          names[kind].add(name);
          return false;
        }
        // A copy that broke off part-way leaves half a file behind. Remove it so the next backup saves it again.
        try {
          for (const entry of dirs[kind].list()) if (entry instanceof File && nameOf(entry.uri) === name) entry.delete();
        } catch {
          // Nothing to remove.
        }
        throw e;
      } finally {
        drop(file);
      }
      names[kind].add(name);
      return true;
    },
    finish() {
      try {
        temp.delete();
      } catch {
        // Nothing left to clear.
      }
    },
  };
}
