import { LIKELY_QUESTIONS, LIVE_QUESTIONS, TOD_CARDS, type LiveLevel, type LiveQuestion } from '@/content/live';

/**
 * Live games: you both play on your own phones at the same moment. Nothing here
 * touches the network, so the rules can be tested on their own.
 */

/* Which game -------------------------------------------------------------- */

export type LiveGame = 'this-or-that' | 'likely' | 'lies' | 'tod';

export const LIVE_GAMES: { key: LiveGame; emoji: string; title: string; blurb: string }[] = [
  { key: 'this-or-that', emoji: '🤔', title: 'This or that', blurb: 'Pick at the same moment and see if you pick alike.' },
  { key: 'likely', emoji: '👉', title: "Who's more likely to…", blurb: 'Point at you or your partner, then see if you agree.' },
  { key: 'lies', emoji: '🤥', title: 'Two truths and a lie', blurb: 'Take turns writing three things about yourself. Spot the lie.' },
  { key: 'tod', emoji: '🔥', title: 'Truth or dare', blurb: 'Take turns. It follows the After dark settings you both chose.' },
];

export function isLiveGame(v: unknown): v is LiveGame {
  return LIVE_GAMES.some((g) => g.key === v);
}

/** The game you're on. Either of you can change it, and the latest choice wins on both phones. */
export type GameChoice = { game: LiveGame | null; at: number; by: string };

export const noChoice: GameChoice = { game: null, at: 0, by: '' };

export function newerChoice(current: GameChoice, incoming: GameChoice): GameChoice {
  if (incoming.at > current.at) return incoming;
  if (incoming.at === current.at && incoming.by < current.by) return incoming;
  return current;
}

/** The person with the lower id runs the game: picks questions and saves rounds. */
export function isHost(userId: string, partnerId: string): boolean {
  return userId < partnerId;
}

export type Role = 'host' | 'guest';

/** Which card levels you can both see: flirty and erotic only once you've both switched them on. */
export function levelsFor(heat: number): LiveLevel[] {
  return heat >= 2 ? ['light', 'flirty', 'erotic'] : heat >= 1 ? ['light', 'flirty'] : ['light'];
}

/**
 * One you haven't had recently, chosen at random.
 * recent: keys asked lately, newest first. random: a number from 0 to 1.
 */
export function pickFrom<T extends { key: string }>(deck: T[], recent: string[], random: number): T {
  const avoid = new Set(recent.slice(0, Math.max(0, Math.min(recent.length, deck.length - 5))));
  const fresh = deck.filter((q) => !avoid.has(q.key));
  const pool = fresh.length ? fresh : deck;
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))];
}

/** This or that only, kept for the tests. */
export function pickQuestion(recent: string[], random: number): LiveQuestion {
  return pickFrom(LIVE_QUESTIONS, recent, random);
}

export function questionByKey(key: string | null): LiveQuestion | undefined {
  return key ? LIVE_QUESTIONS.find((q) => q.key === key) : undefined;
}

export function likelyByKey(key: string | null) {
  return key ? LIKELY_QUESTIONS.find((q) => q.key === key) : undefined;
}

export function todByKey(key: string | null) {
  return key ? TOD_CARDS.find((c) => c.key === key) : undefined;
}

/** How a round is saved in live_rounds, and which game a saved round belongs to. */
export function roundKey(game: LiveGame, key: string): string {
  return game === 'this-or-that' ? key : game === 'lies' ? 'lies' : `${game}:${key}`;
}

export function gameOfRound(questionKey: string): LiveGame {
  if (questionKey === 'lies') return 'lies';
  if (questionKey.startsWith('likely:')) return 'likely';
  if (questionKey.startsWith('tod:')) return 'tod';
  return 'this-or-that';
}

/* Pick at the same moment: this or that, and who's more likely to -------- */

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

/* Two truths and a lie ---------------------------------------------------- */

export type LiesState = {
  round: number;
  /** The three statements, once the teller has sent them. */
  statements: string[] | null;
  /** Which one is the lie: the teller knows from the start, the guesser at the reveal. */
  lie: number | null;
  guess: number | null;
  revealed: boolean;
  /** A point for spotting the lie, or for the teller when it isn't spotted. */
  score: Record<Role, number>;
};

export type LiesAction =
  | { type: 'round'; round: number }
  | { type: 'write'; round: number; statements: string[]; lie?: number }
  | { type: 'guess'; round: number; guess: number }
  | { type: 'reveal'; round: number; lie: number; guess: number }
  /** Your partner's phone tells yours the score, for example after you reopen the game. */
  | { type: 'score'; round: number; score: Record<Role, number> };

export const initialLies: LiesState = { round: 0, statements: null, lie: null, guess: null, revealed: false, score: { host: 0, guest: 0 } };

/** The host writes first, then you take turns. */
export function tellerOf(round: number): Role {
  return round % 2 === 0 ? 'host' : 'guest';
}

const otherRole = (r: Role): Role => (r === 'host' ? 'guest' : 'host');

function settle(s: LiesState): LiesState {
  if (s.revealed || s.lie === null || s.guess === null || !s.statements) return s;
  const teller = tellerOf(s.round);
  const winner = s.guess === s.lie ? otherRole(teller) : teller;
  return { ...s, revealed: true, score: { ...s.score, [winner]: s.score[winner] + 1 } };
}

export function liesReducer(state: LiesState, a: LiesAction): LiesState {
  // Any message from a later round moves you on to it.
  let s = state;
  if (a.round > s.round) s = { ...initialLies, round: a.round, score: s.score };
  if (a.round < s.round) return s;
  switch (a.type) {
    case 'round':
      return s;
    case 'write':
      if (s.statements || a.statements.length !== 3) return s;
      return settle({ ...s, statements: a.statements, lie: a.lie ?? s.lie });
    case 'guess':
      if (!s.statements || s.guess !== null || a.guess < 0 || a.guess > 2) return s;
      return settle({ ...s, guess: a.guess });
    case 'reveal':
      if (s.revealed || !s.statements) return s;
      return settle({ ...s, lie: a.lie, guess: s.guess ?? a.guess });
    case 'score':
      return { ...s, score: maxScore(s.score, a.score) };
  }
}

function maxScore(a: Record<Role, number>, b: Record<Role, number>): Record<Role, number> {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { host: Math.max(n(a.host), n(b.host)), guest: Math.max(n(a.guest), n(b.guest)) };
}

/* Truth or dare ----------------------------------------------------------- */

export type TodResult = 'done' | 'skipped';

export type TodState = {
  turn: number;
  /** The card for this turn, once the player has chosen truth or dare. */
  card: string | null;
  /** A truth answered in writing, if they wrote one. */
  answer: string | null;
  result: TodResult | null;
  done: Record<Role, number>;
};

export type TodAction =
  | { type: 'turn'; turn: number }
  | { type: 'card'; turn: number; key: string }
  | { type: 'answer'; turn: number; text: string }
  | { type: 'result'; turn: number; result: TodResult }
  | { type: 'score'; turn: number; done: Record<Role, number> };

export const initialTod: TodState = { turn: 0, card: null, answer: null, result: null, done: { host: 0, guest: 0 } };

/** The host goes first, then you take turns. */
export function playerOf(turn: number): Role {
  return turn % 2 === 0 ? 'host' : 'guest';
}

export function todReducer(state: TodState, a: TodAction): TodState {
  let s = state;
  if (a.turn > s.turn) s = { ...initialTod, turn: a.turn, done: s.done };
  if (a.turn < s.turn) return s;
  switch (a.type) {
    case 'turn':
      return s;
    case 'card':
      return s.card ? s : { ...s, card: a.key };
    case 'answer':
      return !s.card || s.answer !== null || s.result ? s : { ...s, answer: a.text.slice(0, 500) };
    case 'result': {
      if (!s.card || s.result) return s;
      const player = playerOf(s.turn);
      return { ...s, result: a.result, done: a.result === 'done' ? { ...s.done, [player]: s.done[player] + 1 } : s.done };
    }
    case 'score':
      return { ...s, done: maxScore(s.done, a.done) };
  }
}
