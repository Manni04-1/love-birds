import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** The longest voice note, in seconds. */
export const VOICE_LIMIT = 300;

const web = Platform.OS === 'web';

/** Uploads a recording into the couple's private folder and returns its storage path. */
export async function uploadVoiceNote(coupleId: string, uri: string): Promise<string> {
  const data = web ? await (await fetch(uri)).arrayBuffer() : await new File(uri).arrayBuffer();
  const path = `${coupleId}/voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${web ? 'webm' : 'm4a'}`;
  const { error } = await supabase.storage.from('photos').upload(path, data, { contentType: web ? 'audio/webm' : 'audio/mp4' });
  if (error) throw error;
  return path;
}

/** Removes a recording from the phone once it's sent or thrown away. */
export function deleteRecording(uri: string | null | undefined) {
  if (!uri || web) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The phone clears its cache folder by itself in the end.
  }
}

/** "0:42" or "3:05". */
export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Bar heights from 0 to 1 for a voice note's waveform: made up, but the same every time for the same note. */
export function waveform(seed: string, bars: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const r = (h >>> 0) / 4294967296;
    // Softer at both ends, like someone starting and finishing a sentence.
    const edge = Math.min(1, (i + 1) / 4, (bars - i) / 4);
    out.push(0.2 + 0.8 * r * edge);
  }
  return out;
}
