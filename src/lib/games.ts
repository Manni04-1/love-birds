import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from './supabase';
import type { GameAnswer, Profile } from './types';

/** The decks you can both see: the lower of your two "After dark" settings. */
export function sharedHeat(me: Profile | null | undefined, partner: Profile | null | undefined): number {
  return Math.min(me?.heat ?? 0, partner?.heat ?? 0);
}

export type Game = 'wyr' | 'quiz';

/** Your answers and your partner's for one game, reloaded whenever the screen comes into view. */
export function useGameAnswers(game: Game) {
  const [answers, setAnswers] = useState<Map<string, GameAnswer>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('get_game_answers', { p_game: game });
    setError(err);
    if (!err) setAnswers(new Map(((data ?? []) as GameAnswer[]).map((a) => [a.question_key, a])));
    setLoaded(true);
  }, [game]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { answers, loaded, error, reload };
}

/** Saves your answer. Answers can't be changed afterwards. */
export async function saveGameAnswer(coupleId: string, game: Game, key: string, choice: number, guess?: number) {
  const { error } = await supabase.from('game_answers').insert({
    couple_id: coupleId,
    game,
    question_key: key,
    choice,
    guess: guess ?? null,
  });
  // Answered already (perhaps on another phone): that's fine.
  if (error && error.code !== '23505') throw error;
}

/** Would you rather: how many you've both answered, how many match, and how many wait on you. */
export function wyrStats(answers: Map<string, GameAnswer>, keys: Set<string>) {
  let both = 0;
  let agree = 0;
  let waiting = 0;
  for (const a of answers.values()) {
    if (!keys.has(a.question_key)) continue;
    if (a.my_choice == null) {
      if (a.partner_answered) waiting++;
    } else if (a.partner_choice != null) {
      both++;
      if (a.partner_choice === a.my_choice) agree++;
    }
  }
  return { both, agree, waiting };
}

/** How well do you know me: right guesses each way, out of the questions you've both answered. */
export function quizStats(answers: Map<string, GameAnswer>, keys: Set<string>) {
  let both = 0;
  let youKnow = 0;
  let theyKnow = 0;
  let waiting = 0;
  for (const a of answers.values()) {
    if (!keys.has(a.question_key)) continue;
    if (a.my_choice == null) {
      if (a.partner_answered) waiting++;
    } else if (a.partner_choice != null) {
      both++;
      if (a.my_guess === a.partner_choice) youKnow++;
      if (a.partner_guess === a.my_choice) theyKnow++;
    }
  }
  return { both, youKnow, theyKnow, waiting };
}

/** A small, stable number for an id, used to shuffle a list the same way all session. */
export function hashRank(seed: string, id: string): number {
  let h = 2166136261;
  const s = seed + id;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
