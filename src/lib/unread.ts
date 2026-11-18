import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

/** How many of your partner's messages you haven't read yet. Updates live. */
export function useUnreadCount(coupleId: string | undefined, userId: string | undefined): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!coupleId || !userId) return;
    const { count: n } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('couple_id', coupleId)
      .neq('sender_id', userId)
      .is('read_at', null)
      .is('unsent_at', null);
    setCount(n ?? 0);
  }, [coupleId, userId]);

  useEffect(() => {
    if (!coupleId || !userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Several changes often arrive together (a message, then it being read), so count once they settle.
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 400);
    };
    soon();
    const channel = supabase
      .channel(`unread:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `couple_id=eq.${coupleId}` }, soon)
      .subscribe();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && soon());
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
      supabase.removeChannel(channel);
    };
  }, [coupleId, userId, load]);

  return count;
}
