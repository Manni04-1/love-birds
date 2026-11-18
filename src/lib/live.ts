import { LIVE_QUESTIONS, type LiveQuestion } from '@/content/live';

/**
 * A live game: you both see the same this-or-that question at the same moment.
 * Picks stay hidden until you've both chosen. Nothing here touches the network,
 * so the rules can be tested on their own.
 */
export type Choice = 0 | 1;

export type LiveState = {
  /** The current round, chosen by the host. Null before the first one. */
  id: string | null;
  key: string | null;
  mine: Choice | null;
  theirs: Choice | null;
  /** Rounds you've both answered in this game. */
  played: number;
  /** Rounds where you picked the same. */
  matched: number;
};

export type LiveAction =
  | { type: 'round'; id: string; key: string }
  | { type: 'pick'; who: 'me' | 'them'; id: string; choice: Choice };

export const initialLive: LiveState = { id: null, key: null, mine: null, theirs: null, played: 0, matched: 0 };

export function liveReducer(s: LiveState, a: LiveAction): LiveState {
  switch (a.type) {
    case 'round':
      // The same round can arrive twice, for example when your partner rejoins.
      if (a.id === s.id) return s;
      return { ...s, id: a.id, key: a.key, mine: null, theirs: null };
    case 'pick': {
      if (a.id !== s.id) return s;
      const field = a.who === 'me' ? 'mine' : 'theirs';
      // A pick is final.
      if (s[field] !== null) return s;
      const next: LiveState = { ...s, [field]: a.choice };
      if (next.mine !== null && next.theirs !== null) {
        next.played = s.played + 1;
        next.matched = s.matched + (next.mine === next.theirs ? 1 : 0);
      }
      return next;
    }
  }
}

/** You've both picked, so the answers can be shown. */
export function revealed(s: LiveState): boolean {
  return s.mine !== null && s.theirs !== null;
}

/** The person with the lower id runs the game: picks questions and saves rounds. */
export function isHost(userId: string, partnerId: string): boolean {
  return userId < partnerId;
}

/**
 * The next question: one you haven't had recently, chosen at random.
 * recent: keys asked lately, newest first. random: a number from 0 to 1.
 */
export function pickQuestion(recent: string[], random: number): LiveQuestion {
  const avoid = new Set(recent.slice(0, Math.min(recent.length, LIVE_QUESTIONS.length - 5)));
  const fresh = LIVE_QUESTIONS.filter((q) => !avoid.has(q.key));
  const pool = fresh.length ? fresh : LIVE_QUESTIONS;
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))];
}

export function questionByKey(key: string | null): LiveQuestion | undefined {
  return key ? LIVE_QUESTIONS.find((q) => q.key === key) : undefined;
}
