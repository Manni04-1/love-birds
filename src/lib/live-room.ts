import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

/** A message between your two phones during a live game. Nothing is saved. */
export type LiveMsg = { type: string; from?: string; game?: string } & Record<string, unknown>;

export type LiveRoom = {
  /** You're connected to the game room. */
  connected: boolean;
  /** Your partner has the game room open. */
  partnerHere: boolean;
  send: (msg: LiveMsg) => void;
  /** Hear your partner's messages. Returns a function that stops listening. */
  listen: (fn: (msg: LiveMsg) => void) => () => void;
};

/**
 * The live game room for the two of you. A "hello" goes out whenever you arrive
 * or come back to the app, so your partner's phone can bring yours up to date.
 */
export function useLiveRoom(coupleId: string | undefined, userId: string | undefined): LiveRoom {
  const [connected, setConnected] = useState(false);
  const [partnerHere, setPartnerHere] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const listeners = useRef(new Set<(msg: LiveMsg) => void>());

  const send = useCallback(
    (msg: LiveMsg) => {
      channel.current?.send({ type: 'broadcast', event: 'msg', payload: { ...msg, from: userId } });
    },
    [userId],
  );

  const listen = useCallback((fn: (msg: LiveMsg) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!coupleId || !userId) return;
    // A new room name, so a phone still on the older version doesn't mix up the games.
    const ch = supabase.channel(`play:${coupleId}`, { config: { presence: { key: userId }, broadcast: { self: false } } });
    channel.current = ch;
    const hello = () => ch.send({ type: 'broadcast', event: 'msg', payload: { type: 'hello', from: userId } });
    ch.on('presence', { event: 'sync' }, () => {
      setPartnerHere(Object.keys(ch.presenceState()).some((k) => k !== userId));
    })
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        if (!payload || typeof payload.type !== 'string' || payload.from === userId) return;
        for (const fn of [...listeners.current]) fn(payload as LiveMsg);
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        setConnected(true);
        if (AppState.currentState === 'active') ch.track({ at: Date.now() });
        hello();
      });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        ch.track({ at: Date.now() });
        hello();
      } else ch.untrack();
    });
    return () => {
      sub.remove();
      channel.current = null;
      setConnected(false);
      supabase.removeChannel(ch);
    };
  }, [coupleId, userId]);

  return useMemo(() => ({ connected, partnerHere, send, listen }), [connected, partnerHere, send, listen]);
}
