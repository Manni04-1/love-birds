/**
 * The chimes a phone can play for Love Birds notifications. Each of you picks your own in Settings.
 *
 * The sound files are built into the app (app.json lists them for expo-notifications), so adding
 * a chime needs a new install. Android fixes a notification channel's sound when the channel is
 * made, so each chime has its own channel: 'love' for the original, 'love-<key>' for the rest.
 * The server sends each notification through the channel of the chime saved on your profile
 * (push_to in supabase/chimes.sql), and the app makes that channel before saving the choice.
 */

export type ChimeKey =
  | 'love'
  | 'birdsong'
  | 'music_box'
  | 'harp'
  | 'kalimba'
  | 'marimba'
  | 'steel_pan'
  | 'piano'
  | 'ukulele'
  | 'wind_chimes'
  | 'crystal'
  | 'sparkle'
  | 'doorbell'
  | 'bubbles'
  | 'whistle'
  | 'heartbeat'
  | 'phone'
  | 'none';

export type Chime = {
  key: ChimeKey;
  label: string;
  note: string;
  /** The sound file the channel plays. Left out: the phone's own notification sound. Null: no sound. */
  file?: string | null;
  /** The same sound, for hearing it in Settings. */
  preview?: number;
};

export const CHIMES: Chime[] = [
  { key: 'love', label: 'Love birds', note: 'The original Love Birds chime', file: 'love.wav', preview: require('../../assets/sounds/love.wav') },
  { key: 'birdsong', label: 'Birdsong', note: 'Two little birds chatting', file: 'birdsong.mp3', preview: require('../../assets/sounds/birdsong.mp3') },
  { key: 'music_box', label: 'Music box', note: 'A tiny lullaby', file: 'music_box.mp3', preview: require('../../assets/sounds/music_box.mp3') },
  { key: 'harp', label: 'Harp', note: 'A quick sweep up the strings', file: 'harp.mp3', preview: require('../../assets/sounds/harp.mp3') },
  { key: 'kalimba', label: 'Kalimba', note: 'Warm thumb piano notes', file: 'kalimba.mp3', preview: require('../../assets/sounds/kalimba.mp3') },
  { key: 'marimba', label: 'Marimba', note: 'A bouncy tune on wooden bars', file: 'marimba.mp3', preview: require('../../assets/sounds/marimba.mp3') },
  { key: 'steel_pan', label: 'Steel pan', note: 'Sunny, like a day at the beach', file: 'steel_pan.mp3', preview: require('../../assets/sounds/steel_pan.mp3') },
  { key: 'piano', label: 'Soft piano', note: 'A gentle, dreamy chord', file: 'piano.mp3', preview: require('../../assets/sounds/piano.mp3') },
  { key: 'ukulele', label: 'Ukulele', note: 'A happy little strum', file: 'ukulele.mp3', preview: require('../../assets/sounds/ukulele.mp3') },
  { key: 'wind_chimes', label: 'Wind chimes', note: 'Tinkling in a breeze', file: 'wind_chimes.mp3', preview: require('../../assets/sounds/wind_chimes.mp3') },
  { key: 'crystal', label: 'Crystal', note: 'Two clear tings on a glass', file: 'crystal.mp3', preview: require('../../assets/sounds/crystal.mp3') },
  { key: 'sparkle', label: 'Sparkle', note: 'A quick magic twinkle', file: 'sparkle.mp3', preview: require('../../assets/sounds/sparkle.mp3') },
  { key: 'doorbell', label: 'Ding-dong', note: 'Like a doorbell', file: 'doorbell.mp3', preview: require('../../assets/sounds/doorbell.mp3') },
  { key: 'bubbles', label: 'Bubbles', note: 'Playful and bubbly', file: 'bubbles.mp3', preview: require('../../assets/sounds/bubbles.mp3') },
  { key: 'whistle', label: 'Whistle', note: 'A cheeky whistle', file: 'whistle.mp3', preview: require('../../assets/sounds/whistle.mp3') },
  { key: 'heartbeat', label: 'Heartbeat', note: 'Two soft heartbeats', file: 'heartbeat.mp3', preview: require('../../assets/sounds/heartbeat.mp3') },
  { key: 'phone', label: 'Your phone’s sound', note: 'The sound your phone plays for other apps' },
  { key: 'none', label: 'Vibrate only', note: 'No sound, just the heartbeat buzz', file: null },
];

const BY_KEY = new Map(CHIMES.map((c) => [c.key, c]));

/** The chime for a saved value. Anything unknown (or nothing yet) is the original. */
export function chimeFor(value: unknown): ChimeKey {
  return typeof value === 'string' && BY_KEY.has(value as ChimeKey) ? (value as ChimeKey) : 'love';
}

export function chimeInfo(key: ChimeKey): Chime {
  return BY_KEY.get(key) ?? CHIMES[0];
}

/** The Android channel a chime plays through. */
export function chimeChannel(key: ChimeKey): string {
  return key === 'love' ? 'love' : `love-${key}`;
}

/** True for a channel this app made for a chime (not Android's or Expo's own fallbacks). */
export function isChimeChannel(id: string): boolean {
  return id === 'love' || id.startsWith('love-');
}
