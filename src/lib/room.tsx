import type { RealtimeChannel } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { heartbeat } from './daily';
import { supabase } from './supabase';

type Room = {
  /** Your partner has Love Birds open right now. */
  partnerOnline: boolean;
  /** Your partner is typing a message. */
  partnerTyping: boolean;
  /** Tell your partner you're typing. Safe to call on every key press. */
  typing: () => void;
  /** Tell your partner you've stopped (for example, you sent the message). */
  stopTyping: () => void;
  /** Float hearts up both screens, or one of the chat reactions instead of hearts. */
  sendHearts: (emoji?: string) => void;
  /** Goes up by one each time hearts should float on this screen. */
  hearts: number;
  /** What floats with the latest burst: a reaction emoji, or null for hearts. */
  heartsEmoji: string | null;
};

/** The chat reactions. Each one floats up both screens when you pick it. */
export const REACTIONS = ['❤️', '😂', '😍', '🥺', '😮', '🔥', '👍'];

/** Hearts float as heart shapes; any other reaction floats as itself. */
function floatEmoji(emoji: unknown): string | null {
  return typeof emoji === 'string' && emoji !== '❤️' && REACTIONS.includes(emoji) ? emoji : null;
}

const RoomContext = createContext<Room>({
  partnerOnline: false,
  partnerTyping: false,
  typing: () => {},
  stopTyping: () => {},
  sendHearts: () => {},
  hearts: 0,
  heartsEmoji: null,
});

/**
 * A live connection between your two phones while the app is open: whether your
 * partner is here, whether they're typing, and hearts you send each other.
 * Nothing here is saved.
 */
export function RoomProvider({ coupleId, userId, children }: { coupleId: string | undefined; userId: string | undefined; children: ReactNode }) {
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [hearts, setHearts] = useState(0);
  const [heartsEmoji, setHeartsEmoji] = useState<string | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const lastTyping = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!coupleId || !userId) return;
    const ch = supabase.channel(`room:${coupleId}`, { config: { presence: { key: userId }, broadcast: { self: false } } });
    channel.current = ch;
    const clearTyping = () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = null;
      setPartnerTyping(false);
    };
    ch.on('presence', { event: 'sync' }, () => {
      const here = Object.keys(ch.presenceState()).some((k) => k !== userId);
      setPartnerOnline(here);
      if (!here) clearTyping();
    })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.from === userId) return;
        if (!payload?.on) return clearTyping();
        setPartnerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPartnerTyping(false), 4500);
      })
      .on('broadcast', { event: 'hearts' }, ({ payload }) => {
        if (payload?.from === userId) return;
        setHeartsEmoji(floatEmoji(payload?.emoji));
        setHearts((n) => n + 1);
        heartbeat();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && AppState.currentState === 'active') ch.track({ at: Date.now() });
      });
    // Only "here" while the app is on screen.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') ch.track({ at: Date.now() });
      else ch.untrack();
    });
    return () => {
      sub.remove();
      clearTyping();
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [coupleId, userId]);

  const typing = useCallback(() => {
    const now = Date.now();
    if (now - lastTyping.current < 2500) return;
    lastTyping.current = now;
    channel.current?.send({ type: 'broadcast', event: 'typing', payload: { from: userId, on: true } });
  }, [userId]);

  const stopTyping = useCallback(() => {
    lastTyping.current = 0;
    channel.current?.send({ type: 'broadcast', event: 'typing', payload: { from: userId, on: false } });
  }, [userId]);

  const sendHearts = useCallback(
    (emoji?: string) => {
      setHeartsEmoji(floatEmoji(emoji));
      setHearts((n) => n + 1);
      channel.current?.send({ type: 'broadcast', event: 'hearts', payload: { from: userId, emoji: emoji ?? '❤️' } });
    },
    [userId],
  );

  const value = useMemo(
    () => ({ partnerOnline, partnerTyping, typing, stopTyping, sendHearts, hearts, heartsEmoji }),
    [partnerOnline, partnerTyping, typing, stopTyping, sendHearts, hearts, heartsEmoji],
  );
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): Room {
  return useContext(RoomContext);
}
