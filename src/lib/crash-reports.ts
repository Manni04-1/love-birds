import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { CrashLog } from '../../modules/crash-log';
import { supabase } from './supabase';

/*
 * Problem reports. When something breaks, a short note of what went wrong is kept on the phone
 * and sent to the app_errors table the next time the app opens (supabase/app-errors.sql).
 * Settings > Problem reports lists them, so they can be copied and sent to whoever fixes the app.
 */

export type ProblemReport = { kind: string; message: string; details: string | null; happened_at: string; app_version: string };
export type SentReport = ProblemReport & { id: string; user_id: string; created_at: string };

const PENDING = 'problem-reports-pending';
const EXITS_SINCE = 'problem-reports-exits-since';
const KEEP = 20;

/** "1.5.0 (update 1a2b3c4d), Android 14, Pixel 7". */
export function appVersion(): string {
  const parts = [Constants.expoConfig?.version ?? '?'];
  if (Updates.updateId && !Updates.isEmbeddedLaunch) parts[0] += ` (update ${Updates.updateId.slice(0, 8)})`;
  parts.push(`${Platform.OS === 'android' ? 'Android' : Platform.OS} ${Device.osVersion ?? Platform.Version}`);
  if (Device.modelName) parts.push(Device.modelName);
  return parts.join(', ').slice(0, 120);
}

function clip(text: string | null | undefined, n: number): string | null {
  return text ? text.slice(0, n) : null;
}

async function readPending(): Promise<ProblemReport[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING);
    const list = raw ? (JSON.parse(raw) as ProblemReport[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function addPending(report: ProblemReport) {
  const list = await readPending();
  list.push(report);
  await AsyncStorage.setItem(PENDING, JSON.stringify(list.slice(-KEEP)));
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  return { message: String(error), stack: null };
}

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
let installed = false;

/**
 * Starts noting down problems. Call once, as early as possible. Errors that would close the app
 * are saved first and then passed on to the usual handler, so the app still closes as before.
 */
export function installProblemReports() {
  if (installed) return;
  installed = true;
  try {
    CrashLog?.install();
  } catch {}
  const eu = (globalThis as { ErrorUtils?: { getGlobalHandler: () => ErrorHandler; setGlobalHandler: (h: ErrorHandler) => void } }).ErrorUtils;
  if (!eu) return;
  const before = eu.getGlobalHandler();
  eu.setGlobalHandler((error, isFatal) => {
    let passed = false;
    const pass = () => {
      if (passed) return;
      passed = true;
      before(error, isFatal);
    };
    const { message, stack } = describe(error);
    setTimeout(pass, 600);
    addPending({
      kind: isFatal ? 'App closed' : 'Error',
      message: message.slice(0, 2000),
      details: clip(stack, 8000),
      happened_at: new Date().toISOString(),
      app_version: appVersion(),
    })
      .catch(() => {})
      .finally(pass);
  });
}

/** Notes a problem the app recovered from, such as a screen that had to fall back. */
export function reportProblem(kind: string, error: unknown, where?: string) {
  const { message, stack } = describe(error);
  addPending({
    kind: kind.slice(0, 60),
    message: message.slice(0, 2000),
    details: clip([where, stack].filter(Boolean).join('\n'), 8000),
    happened_at: new Date().toISOString(),
    app_version: appVersion(),
  }).catch(() => {});
}

/** What Android noted down about the app closing, since the last time we looked. */
async function nativeReports(): Promise<{ reports: ProblemReport[]; seenUntil: number | null }> {
  if (!CrashLog) return { reports: [], seenUntil: null };
  const reports: ProblemReport[] = [];
  const version = appVersion();
  try {
    const text = await CrashLog.takeLastCrash();
    if (text) {
      const [time, thread, ...rest] = text.split('\n');
      const trace = rest.join('\n');
      reports.push({
        kind: 'App closed (Android)',
        message: (rest[0] ?? 'Unknown error').slice(0, 2000),
        details: clip(`Thread: ${thread}\n${trace}`, 16000),
        happened_at: new Date(Number(time) || Date.now()).toISOString(),
        app_version: version,
      });
    }
  } catch {}
  let seenUntil: number | null = null;
  try {
    const sinceRaw = await AsyncStorage.getItem(EXITS_SINCE);
    // The first time, only look back a day.
    const since = sinceRaw ? Number(sinceRaw) : Date.now() - 24 * 60 * 60 * 1000;
    const exits = await CrashLog.exitsSince(since);
    seenUntil = Math.max(since, ...exits.map((e) => e.time));
    for (const e of exits) {
      reports.push({
        kind: `Android: ${e.reason}`.slice(0, 60),
        message: (e.description || e.reason).slice(0, 2000),
        details: clip(e.trace, 16000),
        happened_at: new Date(e.time).toISOString(),
        app_version: version,
      });
    }
  } catch {}
  return { reports, seenUntil };
}

/** One crash can be noted three ways (JavaScript, Java and Android's record). Keep the most useful. */
function dedupe(list: ProblemReport[]): ProblemReport[] {
  const t = (r: ProblemReport) => new Date(r.happened_at).getTime();
  const near = (a: ProblemReport, b: ProblemReport) => Math.abs(t(a) - t(b)) < 20000;
  return list.filter((r) => {
    if (r.kind === 'Android: crash') return !list.some((o) => o !== r && o.kind !== r.kind && near(o, r));
    if (r.kind === 'App closed (Android)' && /JavascriptException/.test(r.details ?? r.message)) {
      return !list.some((o) => o.kind === 'App closed' && near(o, r));
    }
    return true;
  });
}

function missingTable(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

let sending = false;

/** Sends any problems noted since last time. Quietly keeps them for later if it can't. */
export async function sendProblemReports(coupleId: string | null | undefined) {
  if (sending) return;
  sending = true;
  try {
    const pending = await readPending();
    const native = await nativeReports();
    const all = dedupe([...pending, ...native.reports]).slice(-KEEP);
    if (all.length) {
      const { error } = await supabase.from('app_errors').insert(all.map((r) => ({ ...r, couple_id: coupleId ?? null })));
      // Android's notes are now in this list, so they're never read twice.
      if (native.seenUntil) await AsyncStorage.setItem(EXITS_SINCE, String(native.seenUntil));
      if (error) {
        // Keep them to send once the table exists or the phone is online.
        await AsyncStorage.setItem(PENDING, JSON.stringify(all));
        return;
      }
      await AsyncStorage.removeItem(PENDING);
    } else if (native.seenUntil) await AsyncStorage.setItem(EXITS_SINCE, String(native.seenUntil));
  } catch {
    // Never let reporting a problem cause one.
  } finally {
    sending = false;
  }
}

/** The couple's most recent problem reports, newest first. Null if the table isn't there yet. */
export async function loadProblemReports(): Promise<SentReport[] | null> {
  const { data, error } = await supabase
    .from('app_errors')
    .select('id, user_id, kind, message, details, app_version, happened_at, created_at')
    .order('happened_at', { ascending: false })
    .limit(20);
  if (error) {
    if (missingTable(error)) return null;
    throw error;
  }
  return (data ?? []) as SentReport[];
}

export async function clearMyProblemReports(userId: string) {
  const { error } = await supabase.from('app_errors').delete().eq('user_id', userId);
  if (error) throw error;
}

/** The text to paste when sending a report on. */
export function reportText(r: ProblemReport): string {
  return [`${r.kind}: ${r.message}`, `When: ${new Date(r.happened_at).toISOString()}`, `App: ${r.app_version}`, r.details ? `\n${r.details}` : ''].join('\n').trim();
}
