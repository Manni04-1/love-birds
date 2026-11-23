import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type MemoryComment = { id: string; memory_id: string; user_id: string; body: string; created_at: string };

/** A table that hasn't been added to the database yet (memory-comments.sql not run). */
function missingTable(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

/**
 * Comments on your memories, by memory, kept up to date while the screen is open.
 * `ready` is false until the comments table exists, so the book can hide them until then.
 */
export function useMemoryComments(coupleId: string | undefined) {
  const [byMemory, setByMemory] = useState<Map<string, MemoryComment[]>>(new Map());
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const { data, error } = await supabase
      .from('memory_comments')
      .select('id, memory_id, user_id, body, created_at')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: true })
      .limit(2000);
    if (error) {
      if (missingTable(error)) setReady(false);
      return;
    }
    const map = new Map<string, MemoryComment[]>();
    for (const row of (data ?? []) as MemoryComment[]) map.set(row.memory_id, [...(map.get(row.memory_id) ?? []), row]);
    setByMemory(map);
    setReady(true);
  }, [coupleId]);

  useEffect(() => {
    if (!coupleId) return;
    const first = setTimeout(load, 0);
    const channel = supabase
      .channel(`memory-comments:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_comments', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  const add = useCallback(
    async (memoryId: string, body: string) => {
      if (!coupleId) return;
      const { error } = await supabase.from('memory_comments').insert({ memory_id: memoryId, couple_id: coupleId, body: body.trim() });
      if (error) throw error;
      await load();
    },
    [coupleId, load],
  );

  const remove = useCallback(
    async (id: string) => {
      setByMemory((prev) => {
        const map = new Map<string, MemoryComment[]>();
        for (const [k, list] of prev) map.set(k, list.filter((x) => x.id !== id));
        return map;
      });
      const { error } = await supabase.from('memory_comments').delete().eq('id', id);
      if (error) {
        await load();
        throw error;
      }
    },
    [load],
  );

  return { comments: byMemory, ready, add, remove, reload: load };
}
