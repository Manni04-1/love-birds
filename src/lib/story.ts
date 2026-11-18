import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';
import type { Milestone } from './types';

export async function loadMilestones(coupleId: string): Promise<Milestone[]> {
  const { data } = await supabase.from('milestones').select('*').eq('couple_id', coupleId).order('happened_on', { ascending: true });
  return (data ?? []) as Milestone[];
}

/** Your story's moments, kept up to date while the app is open. tag keeps each screen's live connection apart. */
export function useMilestones(coupleId: string | undefined, tag: string) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  const reload = useCallback(async () => {
    if (!coupleId) return;
    setMilestones(await loadMilestones(coupleId));
  }, [coupleId]);

  useEffect(() => {
    if (!coupleId) return;
    let live = true;
    const refresh = () => loadMilestones(coupleId).then((m) => live && setMilestones(m));
    refresh();
    const channel = supabase
      .channel(`story-${tag}:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones', filter: `couple_id=eq.${coupleId}` }, () => refresh())
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [coupleId, tag]);

  return { milestones, reload };
}
