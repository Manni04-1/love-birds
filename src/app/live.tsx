import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FloatingHearts } from '@/components/floating-hearts';
import { BackHeader, Panel } from '@/components/game-ui';
import { LiesGame, PickGame, TodGame, type GameProps, type SavedRound } from '@/components/live-games';
import { Avatar, Button, Card, Glyph, Row, T } from '@/components/ui';
import { sharedHeat } from '@/lib/games';
import { isHost, isLiveGame, LIVE_GAMES, newerChoice, noChoice, type GameChoice, type LiveGame } from '@/lib/live';
import { useLiveRoom } from '@/lib/live-room';
import { useCouple } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';

type Invite = 'idle' | 'sending' | 'sent' | 'recent' | 'error';

const clock = () => Date.now();

/** Your rounds so far, newest first. */
async function fetchRounds(coupleId: string) {
  const { data } = await supabase.from('live_rounds').select('question_key, matched').eq('couple_id', coupleId).order('played_at', { ascending: false }).limit(1000);
  return (data ?? []) as SavedRound[];
}

function Player({ name, partner, here }: { name: string; partner?: boolean; here: boolean }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 4, flex: 1 }}>
      <View>
        <Avatar name={name} partner={partner} size={64} />
        <View style={{ position: 'absolute', right: 2, bottom: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: c.page, backgroundColor: here ? '#2BB673' : c.muted }} />
      </View>
      <T variant="strong" numberOfLines={1}>
        {name}
      </T>
      <T variant="fine">{here ? 'Here' : partner ? 'Not here yet' : 'Connecting…'}</T>
    </View>
  );
}

function GamePicker({ onPick }: { onPick: (g: LiveGame) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: space.md }}>
      {LIVE_GAMES.map((g) => (
        <Card key={g.key} onPress={() => onPick(g.key)} accessibilityLabel={`${g.title}. ${g.blurb}`}>
          <Row gap={space.md}>
            <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 28, lineHeight: 34 }}>{g.emoji}</T>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="strong" style={{ fontSize: 18 }}>
                {g.title}
              </T>
              <T variant="small" muted>
                {g.blurb}
              </T>
            </View>
            <Glyph name="next" color={c.muted} />
          </Row>
        </Card>
      ))}
    </View>
  );
}

/** Live games: either of you picks a game, and it opens on both phones. */
export default function Live() {
  const c = useColors();
  const ctx = useCouple();
  const coupleId = ctx?.couple.id;
  const userId = ctx?.userId;
  const room = useLiveRoom(coupleId, userId);
  const [choice, setChoice] = useState<GameChoice>(noChoice);
  const choiceRef = useRef(choice);
  const [history, setHistory] = useState<SavedRound[]>([]);
  const [invite, setInvite] = useState<Invite>('idle');
  const [burst, setBurst] = useState(0);
  const { listen, send } = room;

  useEffect(() => {
    choiceRef.current = choice;
  });

  const loadHistory = useCallback(() => {
    if (coupleId) fetchRounds(coupleId).then(setHistory);
  }, [coupleId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onHearts = useCallback(() => setBurst((b) => b + 1), []);

  // Agree on the game: when your partner arrives you tell them yours, and the latest choice wins.
  useEffect(
    () =>
      listen((m) => {
        if (m.type === 'hello') {
          if (choiceRef.current.at) send({ type: 'game', choice: choiceRef.current });
          return;
        }
        if (m.type !== 'game' || !m.choice || typeof m.choice !== 'object') return;
        const incoming = m.choice as Partial<GameChoice>;
        if ((incoming.game !== null && !isLiveGame(incoming.game)) || typeof incoming.at !== 'number' || typeof incoming.by !== 'string') return;
        setChoice((cur) => newerChoice(cur, { game: incoming.game ?? null, at: incoming.at!, by: incoming.by! }));
      }),
    [listen, send],
  );

  if (!ctx || !coupleId || !userId) return null;
  const { profile, partner } = ctx;
  const host = isHost(userId, partner.id);
  const game = choice.game;
  const info = LIVE_GAMES.find((g) => g.key === game);

  function choose(next: LiveGame | null) {
    const picked: GameChoice = { game: next, at: clock(), by: userId! };
    setChoice(picked);
    send({ type: 'game', choice: picked });
  }

  async function sendInvite() {
    setInvite('sending');
    const { data, error } = await supabase.rpc('invite_to_live');
    setInvite(error ? 'error' : data ? 'sent' : 'recent');
  }

  const inviteNote: Record<Invite, string> = {
    idle: '',
    sending: '',
    sent: `Invite sent. ${partner.name} gets a notification.`,
    recent: `You invited ${partner.name} a moment ago. Give them a minute.`,
    error: 'That invite didn’t go through. Check your connection and try again.',
  };

  const props: GameProps = {
    room,
    host,
    partner: partner.name,
    coupleId,
    heat: sharedHeat(profile, partner),
    history,
    onSaved: loadHistory,
    onHearts,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <BackHeader title="Play live" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <Row>
            <Player name={profile.name} here={room.connected} />
            <T style={{ fontSize: 26, lineHeight: 32 }}>{info?.emoji ?? '🎮'}</T>
            <Player name={partner.name} partner here={room.partnerHere} />
          </Row>

          {!room.partnerHere && (
            <Panel tone="soft">
              <T variant="heading">Waiting for {partner.name}</T>
              <T variant="small">
                {game
                  ? `${info?.title} starts as soon as ${partner.name} opens Play live.`
                  : `Pick a game, then invite ${partner.name}. It opens on both phones as soon as they’re here.`}
              </T>
              <Button title={invite === 'sent' ? 'Invite sent' : `Invite ${partner.name}`} onPress={sendInvite} loading={invite === 'sending'} disabled={invite === 'sent'} />
              {!!inviteNote[invite] && <T variant="small">{inviteNote[invite]}</T>}
            </Panel>
          )}

          {!game ? (
            <View style={{ gap: space.sm }}>
              <T variant="eyebrow">Pick a game</T>
              {room.partnerHere && (
                <T variant="small" muted>
                  It opens on {partner.name}’s phone too.
                </T>
              )}
              <GamePicker onPick={choose} />
            </View>
          ) : (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="heading" style={{ flex: 1 }}>
                  {info?.title}
                </T>
                <Button title="Change game" variant="ghost" onPress={() => choose(null)} />
              </Row>
              {/* Kept open while your partner steps away, so the score survives. */}
              <View style={{ display: room.partnerHere ? 'flex' : 'none' }}>
                {game === 'this-or-that' || game === 'likely' ? (
                  <PickGame key={game} game={game} {...props} />
                ) : game === 'lies' ? (
                  <LiesGame {...props} />
                ) : (
                  <TodGame {...props} />
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <FloatingHearts burst={burst} />
    </SafeAreaView>
  );
}
