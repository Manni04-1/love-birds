import { useCallback, useState } from 'react';

import { addDays, dayNumber, toISODate, today } from './dates';
import { supabase } from './supabase';
import type { Answer, Question } from './types';

let questionCache: Question[] | null = null;

export async function loadQuestions(): Promise<Question[]> {
  if (questionCache) return questionCache;
  const { data } = await supabase.from('questions').select('id, text').order('id');
  questionCache = data ?? [];
  return questionCache;
}

/** The question for a given day. Every couple gets the same one. */
export function questionFor(questions: Question[], date: Date): Question | null {
  if (!questions.length) return null;
  const n = dayNumber(date);
  return questions[((n % questions.length) + questions.length) % questions.length];
}

export type DayAnswers = {
  day: string;
  question: Question | null;
  mine: Answer | null;
  /** Present once your partner has answered, even if the text is still hidden. */
  partner: Answer | null;
};

/** Today's question plus the last few days, with answers. */
export function useQuestions(userId: string | null | undefined, pastDays = 7) {
  const [todayEntry, setToday] = useState<DayAnswers | null>(null);
  const [past, setPast] = useState<DayAnswers[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const t = today();
    const from = toISODate(addDays(t, -pastDays));
    const to = toISODate(t);
    const [questions, { data }] = await Promise.all([
      loadQuestions(),
      supabase.rpc('get_answers', { p_from: from, p_to: to }),
    ]);
    const answers = (data ?? []) as Answer[];
    const byId = new Map(questions.map((q) => [q.id, q]));

    const entryFor = (date: Date): DayAnswers => {
      const day = toISODate(date);
      const rows = answers.filter((a) => a.day === day);
      const mine = rows.find((a) => a.user_id === userId) ?? null;
      const partner = rows.find((a) => a.user_id !== userId) ?? null;
      const qid = (mine ?? partner)?.question_id;
      return { day, question: (qid ? byId.get(qid) : null) ?? questionFor(questions, date), mine, partner };
    };

    setToday(entryFor(t));
    const older: DayAnswers[] = [];
    for (let i = 1; i <= pastDays; i++) {
      const e = entryFor(addDays(t, -i));
      if (e.mine || e.partner) older.push(e);
    }
    setPast(older);
    setLoading(false);
  }, [userId, pastDays]);

  return { today: todayEntry, past, loading, reload: load };
}
