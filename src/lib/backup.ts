import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { parseSticker } from '@/content/stickers';

import { FolderGone, folderLabel, openFolder, type BackupFolder, type FolderRef, type Kind } from './backup-folder';
import { clockLabel, longDate, parseISODate, toISODate } from './dates';
import { friendlyError, supabase } from './supabase';
import type { Message } from './types';
import { durationLabel } from './voice';

// A backup is a folder on the phone holding:
//   Love Birds backup.json  everything the two of you have in the app, enough to bring it all back
//   Chat.txt                the whole chat, readable in any app that opens text
//   Read me.txt             what's in the folder
//   photos/, voice/         every photo and voice note. Each backup only adds the new ones.
// It holds what the person saving it can see: a partner's answer or letter is in it
// once the app would show it to them.

const SETTING = 'backup';

/** How the last backup went, for Settings. */
export type LastBackup = { at: string; folder: string; messages: number; photos: number; voiceNotes: number };
/** Kept on this phone: the folder backups go into, and the last backup. */
export type BackupSetting = { folder?: FolderRef; last?: LastBackup };

export async function readBackupSetting(): Promise<BackupSetting> {
  try {
    const raw = await AsyncStorage.getItem(SETTING);
    return raw ? (JSON.parse(raw) as BackupSetting) : {};
  } catch {
    return {};
  }
}

async function saveSetting(change: BackupSetting) {
  const next = { ...(await readBackupSetting()), ...change };
  await AsyncStorage.setItem(SETTING, JSON.stringify(next)).catch(() => {});
}

/* What gets saved ---------------------------------------------------------- */

type Row = Record<string, unknown>;

// Every table with something of yours in it, in an order that pages reliably.
// Answers, letters, check-ins, photos of the day and game answers come from the
// functions the app uses, so a partner's only appear once they would in the app.
const TABLES: { table: string; order: string[]; couple?: false }[] = [
  { table: 'messages', order: ['created_at', 'id'] },
  { table: 'message_reactions', order: ['message_id', 'user_id'] },
  { table: 'events', order: ['day', 'id'] },
  { table: 'free_days', order: ['day', 'user_id'] },
  { table: 'memories', order: ['happened_on', 'id'] },
  { table: 'memory_loves', order: ['memory_id', 'user_id'], couple: false },
  { table: 'milestones', order: ['happened_on', 'id'] },
  { table: 'moods', order: ['day', 'user_id'] },
  { table: 'nudges', order: ['id'] },
  { table: 'home_safe', order: ['id'] },
  { table: 'challenge_done', order: ['week', 'user_id'] },
  { table: 'bucket_items', order: ['created_at', 'id'] },
  { table: 'list_items', order: ['created_at', 'id'] },
  { table: 'wishes', order: ['created_at', 'id'] },
  { table: 'wish_claims', order: ['wish_id'] },
  { table: 'coupons', order: ['created_at', 'id'] },
  { table: 'funds', order: ['created_at', 'id'] },
  { table: 'fund_entries', order: ['created_at', 'id'] },
  { table: 'deciders', order: ['created_at', 'id'] },
  { table: 'decider_votes', order: ['decider_id', 'option_key'] },
  { table: 'date_ideas', order: ['created_at', 'id'] },
  { table: 'idea_swipes', order: ['idea_id'] },
  { table: 'date_matches', order: ['idea_id'] },
  { table: 'live_rounds', order: ['id'] },
];

const ALL_DAYS = { p_from: '2000-01-01', p_to: '2999-12-31' };
const CALLS: { key: string; fn: string; args?: Record<string, string> }[] = [
  { key: 'answers', fn: 'get_answers', args: ALL_DAYS },
  { key: 'letters', fn: 'get_letters' },
  { key: 'checkins', fn: 'get_checkins', args: ALL_DAYS },
  { key: 'daily_photos', fn: 'get_daily_photos', args: ALL_DAYS },
  { key: 'game_answers_wyr', fn: 'get_game_answers', args: { p_game: 'wyr' } },
  { key: 'game_answers_quiz', fn: 'get_game_answers', args: { p_game: 'quiz' } },
];

const PAGE = 1000;

async function allPages(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const got = (Array.isArray(data) ? data : []) as Row[];
    rows.push(...got);
    if (got.length < PAGE) return rows;
  }
}

/** A table or function that hasn't been added to the database yet. */
function notSetUp(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  return code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883';
}

/** A copy of the row without the named columns. */
function without(row: Row, keys: string[]): Row {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy;
}

const ids = (rows: Row[], key: string) => [...new Set(rows.map((r) => r[key]).filter((v): v is string | number => typeof v === 'string' || typeof v === 'number'))];

async function byIds(table: string, list: (string | number)[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await supabase.from(table).select('*').in('id', list.slice(i, i + 100));
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

/** Runs work on a few items at a time, and stops early if one fails or you stop the backup. */
async function inTurn<T>(items: T[], size: number, stopped: () => boolean, work: (item: T) => Promise<void>) {
  let next = 0;
  let failure: unknown = null;
  const worker = async () => {
    while (next < items.length && !failure) {
      if (stopped()) {
        failure = failure ?? new Stopped();
        return;
      }
      const item = items[next++];
      try {
        await work(item);
      } catch (e) {
        failure = failure ?? e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  if (failure) throw failure;
}

async function gather(coupleId: string, stopped: () => boolean, onStep: (done: number, total: number) => void) {
  const data: Record<string, Row[]> = {};
  const missing: string[] = [];
  const jobs: { key: string; load: () => Promise<Row[]> }[] = [
    { key: 'couple', load: () => allPages((a, b) => supabase.from('couples').select('*').eq('id', coupleId).range(a, b)) },
    { key: 'people', load: () => allPages((a, b) => supabase.from('profiles').select('*').eq('couple_id', coupleId).order('id').range(a, b)) },
    ...TABLES.map(({ table, order, couple }) => ({
      key: table,
      load: () =>
        allPages((a, b) => {
          let q = supabase.from(table).select('*');
          if (couple !== false) q = q.eq('couple_id', coupleId);
          for (const col of order) q = q.order(col, { ascending: true });
          return q.range(a, b);
        }),
    })),
    ...CALLS.map(({ key, fn, args }) => ({ key, load: () => allPages((a, b) => supabase.rpc(fn, args ?? {}).range(a, b)) })),
  ];
  const total = jobs.length + 2;
  let done = 0;
  onStep(done, total);
  const run = async (key: string, load: () => Promise<Row[]>) => {
    try {
      data[key] = await load();
    } catch (e) {
      if (!notSetUp(e)) throw e;
      data[key] = [];
      missing.push(key);
    }
    onStep(++done, total);
  };
  await inTurn(jobs, 4, stopped, (j) => run(j.key, j.load));

  // The questions you answered, and the built-in date ideas you swiped or matched.
  await run('questions', () => byIds('questions', ids(data.answers, 'question_id')));
  const own = new Set(ids(data.date_ideas, 'id'));
  const swiped = [...ids(data.date_matches, 'idea_id'), ...ids(data.idea_swipes, 'idea_id')].filter((id) => !own.has(id));
  await run('built_in_ideas', () => byIds('date_ideas', [...new Set(swiped)]));

  // Nothing private to the app itself: invite codes and the link that sends notifications to a phone.
  data.couple = data.couple.map((r) => without(r, ['invite_code', 'invite_expires_at']));
  data.people = data.people.map((r) => without(r, ['push_token']));
  return { data, missing };
}

/* The files ---------------------------------------------------------------- */

type StoredFile = { kind: Kind; path: string; name: string };

/** Every photo and voice note the saved rows point to. */
function filesOf(data: Record<string, Row[]>): StoredFile[] {
  const found = new Map<string, StoredFile>();
  const add = (path: unknown, kind: Kind) => {
    if (typeof path !== 'string' || !path || found.has(path)) return;
    const name = (path.split('/').pop() ?? path).replace(/[^\w.-]/g, '_');
    found.set(path, { kind, path, name });
  };
  for (const m of data.messages) {
    add(m.image_path, 'photos');
    add(m.audio_path, 'voice');
  }
  for (const m of data.memories) add(m.photo_path, 'photos');
  for (const p of data.daily_photos) add(p.photo_path, 'photos');
  for (const l of data.letters) add(l.photo_path, 'photos');
  return [...found.values()];
}

async function twice<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return work();
  }
}

async function saveFiles(target: BackupFolder, files: StoredFile[], stopped: () => boolean, onStep: (done: number, total: number) => void) {
  const todo = files.filter((f) => !target.has(f.kind, f.name));
  let done = 0;
  let added = 0;
  const missing: StoredFile[] = [];
  onStep(0, todo.length);
  for (let i = 0; i < todo.length; i += 30) {
    if (stopped()) throw new Stopped();
    const batch = todo.slice(i, i + 30);
    const { data, error } = await supabase.storage.from('photos').createSignedUrls(
      batch.map((f) => f.path),
      60 * 60,
    );
    if (error) throw error;
    const links = new Map(data.filter((d) => d.path && d.signedUrl && !d.error).map((d) => [d.path as string, d.signedUrl as string]));
    await inTurn(batch, 3, stopped, async (f) => {
      const link = links.get(f.path);
      // A file the server no longer has. The rest of the backup still goes ahead.
      if (!link) missing.push(f);
      else if (await twice(() => target.saveFromUrl(f.kind, f.name, link))) added++;
      onStep(++done, todo.length);
    });
  }
  return { added, missing };
}

/* The readable copies -------------------------------------------------------- */

const count = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
const fullDay = (iso: string) => parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function chatText(rows: Row[], names: Map<string, string>, files: Map<string, StoredFile>, savedAt: Date): string {
  const messages = (rows as unknown as Message[]).map((m) => ({ m, at: m.deliver_at ?? m.created_at })).sort((a, b) => a.at.localeCompare(b.at));
  const byId = new Map(messages.map(({ m }) => [m.id, m]));
  const who = (id: string) => names.get(id) ?? 'Someone';
  const file = (path: string | null | undefined) => {
    const f = path ? files.get(path) : undefined;
    return f ? `${f.kind}/${f.name}` : 'not saved';
  };
  const people = [...new Set(names.values())].join(' and ');
  const lines = [`Love Birds chat between ${people}`, `Saved on ${longDate(toISODate(savedAt))} at ${clockLabel(savedAt.toISOString())}`];
  let day = '';
  for (const { m, at } of messages) {
    const iso = toISODate(new Date(at));
    if (iso !== day) {
      day = iso;
      lines.push('', fullDay(iso), '');
    }
    const parts: string[] = [];
    if (m.unsent_at) parts.push('(unsent)');
    else {
      const quoted = m.reply_to ? byId.get(m.reply_to) : undefined;
      if (quoted) {
        const sticker = parseSticker(quoted.sticker);
        const words =
          quoted.body?.replace(/\s+/g, ' ').trim() ||
          (quoted.image_path ? 'a photo' : quoted.audio_path ? 'a voice note' : sticker ? `${sticker.emoji} ${sticker.text}` : 'a message');
        parts.push(`(replying to ${who(quoted.sender_id)}: “${words.length > 60 ? `${words.slice(0, 59)}…` : words}”)`);
      }
      if (m.image_path) parts.push(`[Photo: ${file(m.image_path)}]`);
      if (m.audio_path) parts.push(`[Voice note${m.audio_ms ? `, ${durationLabel(m.audio_ms)}` : ''}: ${file(m.audio_path)}]`);
      const sticker = parseSticker(m.sticker);
      if (sticker) parts.push(`[Sticker: ${sticker.emoji} ${sticker.text}]`);
      if (m.body) parts.push(m.body.replace(/\n/g, '\n          '));
      if (m.edited_at) parts.push('(edited)');
      if (m.deliver_at && new Date(m.deliver_at) > savedAt) parts.push('(scheduled)');
    }
    lines.push(`${clockLabel(at).padStart(8)}  ${who(m.sender_id)}: ${parts.join(' ')}`);
  }
  if (!messages.length) lines.push('', 'No messages yet.');
  return `${lines.join('\n')}\n`;
}

function readMe(name: string, savedAt: Date): string {
  return [
    'Love Birds backup',
    `Saved by ${name} on ${longDate(toISODate(savedAt))} at ${clockLabel(savedAt.toISOString())}.`,
    '',
    'Chat.txt: your whole chat, to read in any app that opens text files.',
    'photos: every photo from your chat, memories, letters and photos of the day.',
    'voice: every voice note.',
    'Love Birds backup.json: everything in the app, including plans, answers, letters, lists and games. It isn’t made for reading, but it holds what’s needed to bring it all back if the app ever loses it.',
    '',
    'Each backup adds the new photos and voice notes and replaces these three files with up-to-date copies. Nothing here is ever deleted by the app.',
    '',
  ].join('\n');
}

/* Running a backup ----------------------------------------------------------- */

export class Stopped extends Error {
  constructor() {
    super('Stopped');
  }
}

export type Progress = { phase: 'data' | 'files'; done: number; total: number };
export type Summary = LastBackup & { added: number; missing: number };

async function saveBackup(coupleId: string, userId: string, folder: FolderRef, stopped: () => boolean, onProgress: (p: Progress) => void): Promise<Summary> {
  const target = await openFolder(folder);
  // Remember the photos and voice folders straight away, so they're never made twice.
  await saveSetting({ folder: target.ref });
  try {
    const { data, missing } = await gather(coupleId, stopped, (done, total) => onProgress({ phase: 'data', done, total }));
    const files = filesOf(data);
    const savedAt = new Date();
    const names = new Map(data.people.map((p) => [String(p.id), String(p.name ?? 'Someone')]));
    const { couple, people, ...rest } = data;
    const backup = {
      app: 'Love Birds',
      format: 1,
      saved_at: savedAt.toISOString(),
      saved_by: userId,
      couple: couple[0] ?? null,
      people,
      // Each saved photo and voice note, and where it lives in the app's storage.
      files: Object.fromEntries(files.map((f) => [`${f.kind}/${f.name}`, f.path])),
      ...(missing.length ? { not_set_up: missing } : {}),
      ...rest,
    };
    if (stopped()) throw new Stopped();
    await target.writeText('Love Birds backup.json', JSON.stringify(backup, null, 1));
    await target.writeText('Chat.txt', chatText(data.messages, names, new Map(files.map((f) => [f.path, f])), savedAt));
    await target.writeText('Read me.txt', readMe(names.get(userId) ?? 'you', savedAt));

    const saved = await saveFiles(target, files, stopped, (done, total) => onProgress({ phase: 'files', done, total }));
    const last: LastBackup = {
      at: savedAt.toISOString(),
      folder: folderLabel(target.ref),
      messages: data.messages.filter((m) => !m.unsent_at).length,
      photos: files.filter((f) => f.kind === 'photos' && !saved.missing.includes(f)).length,
      voiceNotes: files.filter((f) => f.kind === 'voice' && !saved.missing.includes(f)).length,
    };
    await saveSetting({ last });
    return { ...last, added: saved.added, missing: saved.missing.length };
  } finally {
    target.finish();
  }
}

export type BackupRun =
  | { state: 'idle' }
  | { state: 'running'; progress: Progress }
  | { state: 'done'; summary: Summary }
  | { state: 'stopped' }
  | { state: 'failed'; message: string; folderGone: boolean };

// One backup at a time, which keeps going if you leave Settings and shows again when you come back.
let run: BackupRun = { state: 'idle' };
let stopAsked = false;
const listeners = new Set<() => void>();

function setRun(next: BackupRun) {
  run = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBackupRun(): BackupRun {
  return useSyncExternalStore(subscribe, () => run);
}

export function stopBackup() {
  stopAsked = true;
}

/** Forgets how the last backup went once you've seen it. A backup that's still going carries on. */
export function clearFinishedBackup() {
  if (run.state !== 'running') setRun({ state: 'idle' });
}

function backupError(e: unknown): string {
  const text = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/no space|ENOSPC|disk full/i.test(text)) return 'Your phone is out of space. Free some up, then tap Save a backup to carry on.';
  if (/unable to download|response has status|timeout|network|fetch|connection|socket/i.test(text)) {
    return 'The connection dropped. Tap Save a backup to carry on where it stopped.';
  }
  return friendlyError(e);
}

/** Saves a backup into the folder, then reports how it went through useBackupRun(). */
export async function startBackup(coupleId: string, userId: string, folder: FolderRef) {
  if (run.state === 'running') return;
  stopAsked = false;
  setRun({ state: 'running', progress: { phase: 'data', done: 0, total: 1 } });
  try {
    const summary = await saveBackup(coupleId, userId, folder, () => stopAsked, (progress) => setRun({ state: 'running', progress }));
    setRun({ state: 'done', summary });
  } catch (e) {
    if (e instanceof Stopped) return setRun({ state: 'stopped' });
    const folderGone = e instanceof FolderGone;
    if (folderGone) await saveSetting({ folder: undefined });
    setRun({ state: 'failed', message: folderGone ? e.message : backupError(e), folderGone });
  }
}

/** Says how much a backup holds, such as "1,204 messages, 86 photos and 9 voice notes". */
export function describeBackup(b: LastBackup): string {
  return `${plural(b.messages, 'message', 'messages')}, ${plural(b.photos, 'photo', 'photos')} and ${plural(b.voiceNotes, 'voice note', 'voice notes')}`;
}
