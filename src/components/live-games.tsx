import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Option, Panel, Pill } from '@/components/game-ui';
import { Button, Chip, Field, Row, T } from '@/components/ui';
import { LIKELY_QUESTIONS, LIVE_QUESTIONS, TOD_CARDS, type LiveLevel } from '@/content/live';
import {
  gameOfRound,
  initialLies,
  initialLive,
  initialTod,
  levelsFor,
  liesReducer,
  likelyByKey,
  liveReducer,
  pickFrom,
  playerOf,
  questionByKey,
  revealed,
  roundKey,
  tellerOf,
  todByKey,
  todReducer,
  type Choice,
  type Role,
  type TodResult,
} from '@/lib/live';
import type { LiveMsg, LiveRoom } from '@/lib/live-room';
import { supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';

export type SavedRound = { question_key: string; matched: boolean };

export type GameProps = {
  room: LiveRoom;
  /** You run the game: you ask the questions and save the rounds. */
  host: boolean;
  /** Your partner's name, as you call them. */
  partner: string;
  coupleId: string;
  /** The lower of your two After dark settings. */
  heat: number;
  /** Rounds you've played before, newest first. */
  history: SavedRound[];
  onSaved: () => void;
  onHearts: () => void;
};

const clock = () => Date.now();
const rand = () => Math.random();
const other = (r: Role): Role => (r === 'host' ? 'guest' : 'host');

async function saveRound(coupleId: string, key: string, matched: boolean) {
  await supabase.from('live_rounds').insert({ couple_id: coupleId, question_key: key, matched });
}

const LEVEL_LABEL: Record<LiveLevel, string> = { light: '🌤️ Light', flirty: '😏 Flirty', erotic: '🔥 Erotic' };

function Waiting({ children }: { children: string }) {
  const c = useColors();
  return (
    <Panel>
      <Row>
        <ActivityIndicator color={c.accent} />
        <T variant="small" muted style={{ flex: 1 }}>
          {children}
        </T>
      </Row>
    </Panel>
  );
}

/**
 * Listens for this game's messages, and asks your partner's phone to catch up
 * whenever the game opens. Handlers can change on every render.
 */
function useGameMessages(room: LiveRoom, game: string, handle: (m: LiveMsg) => void, onSync: () => void) {
  const latest = useRef({ handle, onSync });
  useEffect(() => {
    latest.current = { handle, onSync };
  });
  const { listen, send } = room;
  useEffect(() => {
    const stop = listen((m) => {
      if (m.game !== game) return;
      if (m.type === 'sync') {
        // Answer once, so you each learn the other is here.
        if (!m.reply) send({ type: 'sync', game, reply: true });
        latest.current.onSync();
      } else latest.current.handle(m);
    });
    send({ type: 'sync', game });
    return stop;
  }, [listen, send, game]);
}

/* This or that, and who's more likely to ---------------------------------- */

/** Both of you pick at the same moment. In "who's more likely to", 0 is the host and 1 is their partner. */
export function PickGame({ game, room, host, partner, coupleId, heat, history, onSaved, onHearts }: GameProps & { game: 'this-or-that' | 'likely' }) {
  const deck = useMemo<{ key: string }[]>(() => {
    const levels = levelsFor(heat);
    return game === 'likely' ? LIKELY_QUESTIONS.filter((q) => levels.includes(q.level)) : LIVE_QUESTIONS;
  }, [game, heat]);
  const [state, dispatch] = useReducer(liveReducer, initialLive);
  const stateRef = useRef(state);
  const round = useRef<{ id: string; key: string } | null>(null);
  const recent = useRef<string[]>([]);
  const saved = useRef(new Set<string>());
  const celebrated = useRef(new Set<string>());
  const { send } = room;

  useEffect(() => {
    stateRef.current = state;
  });

  // Questions you've had lately go to the back of the queue.
  useEffect(() => {
    const keys = history.filter((r) => gameOfRound(r.question_key) === game).map((r) => r.question_key.replace(/^likely:/, ''));
    recent.current = [...recent.current, ...keys.slice(0, 40).filter((k) => !recent.current.includes(k))];
  }, [history, game]);

  const startRound = useCallback(() => {
    const q = pickFrom(deck, recent.current, rand());
    recent.current = [q.key, ...recent.current.filter((k) => k !== q.key)];
    const id = `${clock().toString(36)}-${q.key}`;
    round.current = { id, key: q.key };
    dispatch({ type: 'round', id, key: q.key });
    send({ type: 'round', game, id, key: q.key });
  }, [deck, send, game]);

  useGameMessages(
    room,
    game,
    (m) => {
      const s = stateRef.current;
      if (m.type === 'round' && typeof m.id === 'string' && typeof m.key === 'string' && deck.some((q) => q.key === m.key)) {
        round.current = { id: m.id, key: m.key };
        dispatch({ type: 'round', id: m.id, key: m.key });
      } else if (m.type === 'pick' && typeof m.id === 'string' && (m.choice === 0 || m.choice === 1)) {
        dispatch({ type: 'pick', who: 'them', id: m.id, choice: m.choice });
      } else if (m.type === 'next' && host && revealed(s)) startRound();
    },
    () => {
      const s = stateRef.current;
      if (host) {
        if (round.current) send({ type: 'round', game, ...round.current });
        else startRound();
      }
      if (s.id && s.mine !== null) send({ type: 'pick', game, id: s.id, choice: s.mine });
    },
  );

  // Once you've both picked: hearts if you matched, and the host saves the round.
  const done = revealed(state);
  useEffect(() => {
    if (!done || !state.id || !state.key) return;
    const same = state.mine === state.theirs;
    if (same && !celebrated.current.has(state.id)) {
      celebrated.current.add(state.id);
      onHearts();
    }
    if (host && !saved.current.has(state.id)) {
      saved.current.add(state.id);
      saveRound(coupleId, roundKey(game, state.key), same).then(onSaved);
    } else if (!host) {
      // Give the host a moment to save it first.
      const t = setTimeout(onSaved, 1500);
      return () => clearTimeout(t);
    }
  }, [done, state.id, state.key, state.mine, state.theirs, host, coupleId, game, onHearts, onSaved]);

  const likely = game === 'likely' ? likelyByKey(state.key) : undefined;
  const tot = game === 'this-or-that' ? questionByKey(state.key) : undefined;
  if (!likely && !tot) return <Waiting>Getting the first question…</Waiting>;

  const myAbs: Choice = host ? 0 : 1;
  const options: { label: string; abs: Choice }[] = likely
    ? [
        { label: '🙋 Me', abs: myAbs },
        { label: `👉 ${partner}`, abs: (1 - myAbs) as Choice },
      ]
    : [
        { label: tot!.a, abs: 0 },
        { label: tot!.b, abs: 1 },
      ];
  const same = state.mine === state.theirs;
  const result = likely
    ? same
      ? state.mine === myAbs
        ? 'You both say it’s you 😄'
        : `You both say it’s ${partner} 😄`
      : 'You don’t agree 🙈'
    : same
      ? 'Same! 💞'
      : 'Different picks 😄';
  const past = history.filter((r) => gameOfRound(r.question_key) === game);
  const pastMatched = past.filter((r) => r.matched).length;
  const word = likely ? 'agreed' : 'alike';

  return (
    <View style={{ gap: space.lg }}>
      <Panel>
        <T variant="eyebrow">Round {state.played + (done ? 0 : 1)}</T>
        <T variant="heading">{likely ? `Who’s more likely to ${likely.text}?` : 'This or that?'}</T>
        {options.map((o) => {
          const mine = state.mine === o.abs;
          const theirs = done && state.theirs === o.abs;
          return (
            <Option
              key={o.abs}
              label={o.label}
              selected={mine}
              disabled={state.mine !== null}
              onPress={() => {
                const s = stateRef.current;
                if (!s.id || s.mine !== null) return;
                dispatch({ type: 'pick', who: 'me', id: s.id, choice: o.abs });
                send({ type: 'pick', game, id: s.id, choice: o.abs });
              }}
              trailing={
                <Row gap={4}>
                  {mine && <Pill accent>You</Pill>}
                  {theirs && <Pill>{partner}</Pill>}
                </Row>
              }
            />
          );
        })}
        {!done ? (
          <T variant="small" muted>
            {state.mine === null ? (state.theirs !== null ? `${partner} has picked. Your turn!` : 'Go with your gut.') : `Waiting for ${partner}…`}
          </T>
        ) : (
          <>
            <T variant="heading" style={{ textAlign: 'center' }}>
              {result}
            </T>
            <Button title="Next question" onPress={() => (host ? startRound() : send({ type: 'next', game }))} />
          </>
        )}
      </Panel>
      {(state.played > 0 || past.length > 0) && (
        <View style={{ gap: 4, alignItems: 'center' }}>
          {state.played > 0 && (
            <T variant="strong">
              This game: {state.matched} of {state.played} {word}
            </T>
          )}
          {past.length > 0 && (
            <T variant="small" muted>
              All time: {pastMatched} of {past.length} {word} ({Math.round((pastMatched / past.length) * 100)}%)
            </T>
          )}
        </View>
      )}
    </View>
  );
}

/* Two truths and a lie ---------------------------------------------------- */

export function LiesGame({ room, host, partner, coupleId, onSaved, onHearts }: GameProps) {
  const c = useColors();
  const [s, dispatch] = useReducer(liesReducer, initialLies);
  const sRef = useRef(s);
  const sentReveal = useRef(new Set<number>());
  const celebrated = useRef(new Set<number>());
  const [drafts, setDrafts] = useState(['', '', '']);
  const [lieDraft, setLieDraft] = useState<number | null>(null);
  const [draftRound, setDraftRound] = useState(0);
  const { send } = room;
  const me: Role = host ? 'host' : 'guest';
  const iTell = tellerOf(s.round) === me;

  useEffect(() => {
    sRef.current = s;
  });

  // A fresh page for every round.
  if (draftRound !== s.round) {
    setDraftRound(s.round);
    setDrafts(['', '', '']);
    setLieDraft(null);
  }

  useGameMessages(
    room,
    'lies',
    (m) => {
      const round = Number(m.round);
      if (!Number.isInteger(round) || round < 0) return;
      if (m.type === 'round') dispatch({ type: 'round', round });
      else if (m.type === 'write' && Array.isArray(m.statements) && m.statements.length === 3 && m.statements.every((x) => typeof x === 'string'))
        dispatch({ type: 'write', round, statements: (m.statements as string[]).map((x) => x.slice(0, 140)) });
      else if (m.type === 'guess' && typeof m.guess === 'number') dispatch({ type: 'guess', round, guess: m.guess });
      else if (m.type === 'reveal' && typeof m.lie === 'number' && typeof m.guess === 'number') dispatch({ type: 'reveal', round, lie: m.lie, guess: m.guess });
      else if (m.type === 'score' && m.score && typeof m.score === 'object') dispatch({ type: 'score', round, score: m.score as Record<Role, number> });
    },
    () => {
      const cur = sRef.current;
      send({ type: 'round', game: 'lies', round: cur.round });
      send({ type: 'score', game: 'lies', round: cur.round, score: cur.score });
      if (tellerOf(cur.round) === me) {
        if (cur.statements) send({ type: 'write', game: 'lies', round: cur.round, statements: cur.statements });
        if (cur.revealed) send({ type: 'reveal', game: 'lies', round: cur.round, lie: cur.lie, guess: cur.guess });
      } else if (cur.guess !== null) send({ type: 'guess', game: 'lies', round: cur.round, guess: cur.guess });
    },
  );

  // The teller's phone knows the lie, so it shows the answer on both phones and saves the round.
  useEffect(() => {
    if (!s.revealed || s.lie === null || s.guess === null) return;
    if (iTell && !sentReveal.current.has(s.round)) {
      sentReveal.current.add(s.round);
      send({ type: 'reveal', game: 'lies', round: s.round, lie: s.lie, guess: s.guess });
      saveRound(coupleId, 'lies', s.guess === s.lie).then(onSaved);
    }
    if (s.guess === s.lie && !celebrated.current.has(s.round)) {
      celebrated.current.add(s.round);
      onHearts();
    }
  }, [s.revealed, s.lie, s.guess, s.round, iTell, send, coupleId, onSaved, onHearts]);

  const teller = iTell ? 'You' : partner;
  const nextTeller = iTell ? partner : 'your';
  const ready = drafts.every((d) => d.trim()) && lieDraft !== null;

  function next() {
    const round = s.round + 1;
    dispatch({ type: 'round', round });
    send({ type: 'round', game: 'lies', round });
  }

  const scoreLine = (
    <T variant="small" muted style={{ textAlign: 'center' }}>
      Score: you {s.score[me]} · {partner} {s.score[other(me)]}
    </T>
  );

  if (!s.statements) {
    if (!iTell)
      return (
        <View style={{ gap: space.lg }}>
          <Waiting>{`${partner} is writing two truths and a lie. Get ready to spot the lie.`}</Waiting>
          {scoreLine}
        </View>
      );
    return (
      <View style={{ gap: space.lg }}>
        <Panel>
          <T variant="heading">Your turn to write</T>
          <T variant="small" muted>
            Three things about you: two true and one made up. Then mark the lie. {partner} only sees the three sentences.
          </T>
          {drafts.map((d, i) => (
            <View key={i} style={{ gap: space.sm }}>
              <Field
                label={`Number ${i + 1}`}
                value={d}
                onChangeText={(t) => setDrafts((list) => list.map((x, j) => (j === i ? t : x)))}
                placeholder={['I once met a famous footballer', 'I can’t swim', 'I’ve been to Lamu three times'][i]}
                maxLength={140}
              />
              <Chip label={lieDraft === i ? '🤥 This one’s the lie' : 'This one’s the lie'} selected={lieDraft === i} onPress={() => setLieDraft(i)} />
            </View>
          ))}
          <Button
            title={`Send to ${partner}`}
            disabled={!ready}
            onPress={() => {
              const statements = drafts.map((d) => d.trim());
              dispatch({ type: 'write', round: s.round, statements, lie: lieDraft ?? undefined });
              send({ type: 'write', game: 'lies', round: s.round, statements });
            }}
          />
        </Panel>
        {scoreLine}
      </View>
    );
  }

  const spotted = s.guess === s.lie;
  return (
    <View style={{ gap: space.lg }}>
      <Panel>
        <T variant="eyebrow">{iTell ? 'Your two truths and a lie' : `${partner}’s two truths and a lie`}</T>
        <T variant="heading">
          {s.revealed
            ? spotted
              ? iTell
                ? `${partner} spotted your lie 🕵️`
                : 'You spotted the lie! 🕵️'
              : iTell
                ? `You fooled ${partner} 😏`
                : `${partner} fooled you 😏`
            : iTell
              ? `${partner} is guessing…`
              : 'Which one is the lie?'}
        </T>
        {s.statements.map((text, i) => {
          const isLie = s.lie === i;
          const guessed = s.guess === i;
          const showLie = s.revealed || iTell;
          return (
            <Option
              key={i}
              label={text}
              selected={guessed}
              disabled={iTell || s.guess !== null}
              onPress={() => {
                if (iTell || sRef.current.guess !== null) return;
                dispatch({ type: 'guess', round: s.round, guess: i });
                send({ type: 'guess', game: 'lies', round: s.round, guess: i });
              }}
              trailing={
                <Row gap={4}>
                  {guessed && <Pill accent>{iTell ? `${partner}’s guess` : 'Your guess'}</Pill>}
                  {showLie && isLie && <Pill>🤥 Lie</Pill>}
                  {s.revealed && !isLie && <Pill>✓ True</Pill>}
                </Row>
              }
            />
          );
        })}
        {!s.revealed && !iTell && s.guess !== null && (
          <T variant="small" muted>
            Checking…
          </T>
        )}
        {s.revealed && <Button title={`Next: ${nextTeller === 'your' ? 'your' : `${nextTeller}’s`} turn to write`} onPress={next} />}
      </Panel>
      <View style={{ gap: 4 }}>
        {scoreLine}
        <T variant="fine" style={{ textAlign: 'center', color: c.muted }}>
          {teller === 'You' ? 'You write' : `${partner} writes`} this round. You take turns.
        </T>
      </View>
    </View>
  );
}

/* Truth or dare ----------------------------------------------------------- */

export function TodGame({ room, host, partner, coupleId, heat, onSaved, onHearts }: GameProps) {
  const c = useColors();
  const [s, dispatch] = useReducer(todReducer, initialTod);
  const sRef = useRef(s);
  const recent = useRef<string[]>([]);
  const savedTurns = useRef(new Set<number>());
  const celebrated = useRef(new Set<number>());
  const levels = levelsFor(heat);
  const [level, setLevel] = useState<LiveLevel>('light');
  const [answer, setAnswer] = useState('');
  const [answerTurn, setAnswerTurn] = useState(0);
  const { send } = room;
  const me: Role = host ? 'host' : 'guest';
  const myTurn = playerOf(s.turn) === me;
  const card = todByKey(s.card);

  useEffect(() => {
    sRef.current = s;
  });

  if (answerTurn !== s.turn) {
    setAnswerTurn(s.turn);
    setAnswer('');
  }

  useGameMessages(
    room,
    'tod',
    (m) => {
      const turn = Number(m.turn);
      if (!Number.isInteger(turn) || turn < 0) return;
      if (m.type === 'turn') dispatch({ type: 'turn', turn });
      else if (m.type === 'card' && typeof m.key === 'string' && todByKey(m.key)) dispatch({ type: 'card', turn, key: m.key });
      else if (m.type === 'answer' && typeof m.text === 'string') dispatch({ type: 'answer', turn, text: m.text });
      else if (m.type === 'result' && (m.result === 'done' || m.result === 'skipped')) dispatch({ type: 'result', turn, result: m.result });
      else if (m.type === 'score' && m.done && typeof m.done === 'object') dispatch({ type: 'score', turn, done: m.done as Record<Role, number> });
    },
    () => {
      const cur = sRef.current;
      send({ type: 'turn', game: 'tod', turn: cur.turn });
      send({ type: 'score', game: 'tod', turn: cur.turn, done: cur.done });
      if (playerOf(cur.turn) !== me || !cur.card) return;
      send({ type: 'card', game: 'tod', turn: cur.turn, key: cur.card });
      if (cur.answer !== null) send({ type: 'answer', game: 'tod', turn: cur.turn, text: cur.answer });
      if (cur.result) send({ type: 'result', game: 'tod', turn: cur.turn, result: cur.result });
    },
  );

  // Hearts when a dare or truth is done; the player's phone saves the turn.
  useEffect(() => {
    if (!s.result || !s.card) return;
    if (myTurn && !savedTurns.current.has(s.turn)) {
      savedTurns.current.add(s.turn);
      saveRound(coupleId, roundKey('tod', s.card), s.result === 'done').then(onSaved);
    }
    if (s.result === 'done' && !celebrated.current.has(s.turn)) {
      celebrated.current.add(s.turn);
      onHearts();
    }
  }, [s.result, s.card, s.turn, myTurn, coupleId, onSaved, onHearts]);

  function draw(kind: 'truth' | 'dare') {
    const use = levels.includes(level) ? level : 'light';
    const deck = TOD_CARDS.filter((x) => x.kind === kind && x.level === use);
    const picked = pickFrom(deck, recent.current, rand());
    recent.current = [picked.key, ...recent.current.filter((k) => k !== picked.key)];
    dispatch({ type: 'card', turn: s.turn, key: picked.key });
    send({ type: 'card', game: 'tod', turn: s.turn, key: picked.key });
  }

  function finish(result: TodResult) {
    dispatch({ type: 'result', turn: s.turn, result });
    send({ type: 'result', game: 'tod', turn: s.turn, result });
  }

  function next() {
    const turn = s.turn + 1;
    dispatch({ type: 'turn', turn });
    send({ type: 'turn', game: 'tod', turn });
  }

  const scoreLine = (
    <T variant="small" muted style={{ textAlign: 'center' }}>
      Done so far: you {s.done[me]} · {partner} {s.done[other(me)]}
    </T>
  );

  if (!card) {
    if (!myTurn)
      return (
        <View style={{ gap: space.lg }}>
          <Waiting>{`${partner} is choosing truth or dare…`}</Waiting>
          {scoreLine}
        </View>
      );
    return (
      <View style={{ gap: space.lg }}>
        <Panel>
          <T variant="heading">Your turn: truth or dare?</T>
          {levels.length > 1 && (
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {levels.map((l) => (
                <Chip key={l} label={LEVEL_LABEL[l]} selected={level === l} onPress={() => setLevel(l)} />
              ))}
            </Row>
          )}
          <Row>
            <Button style={{ flex: 1 }} title="💬 Truth" variant="outline" onPress={() => draw('truth')} />
            <Button style={{ flex: 1 }} title="🔥 Dare" onPress={() => draw('dare')} />
          </Row>
          {levels.length === 1 && (
            <T variant="fine">Flirty and erotic cards appear once you’ve both switched them on under Settings, After dark.</T>
          )}
        </Panel>
        {scoreLine}
      </View>
    );
  }

  const who = myTurn ? 'Your' : `${partner}’s`;
  return (
    <View style={{ gap: space.lg }}>
      <Panel tone={card.kind === 'dare' ? 'soft' : 'plain'}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="eyebrow">
            {who} {card.kind}
          </T>
          {card.level !== 'light' && <Pill>{LEVEL_LABEL[card.level]}</Pill>}
        </Row>
        <T variant="heading">{card.text}</T>
        {s.answer !== null && (
          <View style={{ backgroundColor: c.surface2, borderRadius: radius.md, padding: space.md, gap: 4 }}>
            <T variant="fine">{myTurn ? 'You answered' : `${partner} answered`}</T>
            <T>{s.answer}</T>
          </View>
        )}
        {myTurn && !s.result && card.kind === 'truth' && s.answer === null && (
          <>
            <Field label="Type your answer, or just say it out loud" value={answer} onChangeText={setAnswer} multiline maxLength={500} />
            {!!answer.trim() && (
              <Button
                title="Send my answer"
                variant="outline"
                onPress={() => {
                  dispatch({ type: 'answer', turn: s.turn, text: answer.trim() });
                  send({ type: 'answer', game: 'tod', turn: s.turn, text: answer.trim() });
                }}
              />
            )}
          </>
        )}
        {!s.result ? (
          myTurn ? (
            <Row>
              <Button style={{ flex: 1 }} title="Skip" variant="outline" onPress={() => finish('skipped')} />
              <Button style={{ flex: 1 }} title="Done ✓" onPress={() => finish('done')} />
            </Row>
          ) : (
            <T variant="small" muted>
              Waiting for {partner}…
            </T>
          )
        ) : (
          <>
            <T variant="heading" style={{ textAlign: 'center' }}>
              {s.result === 'done' ? (myTurn ? 'Nice one! ❤️' : `${partner} did it! ❤️`) : myTurn ? 'Skipped' : `${partner} skipped this one`}
            </T>
            <Button title={myTurn ? `${partner}’s turn` : 'Your turn'} onPress={next} />
          </>
        )}
      </Panel>
      {scoreLine}
    </View>
  );
}
