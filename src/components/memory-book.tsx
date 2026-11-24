import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';

import { HeartShape, useReducedMotion } from '@/components/hero';
import { Photo } from '@/components/photo';
import { Glyph, Hand, Row, T } from '@/components/ui';
import { longDate, parseISODate } from '@/lib/dates';
import type { MemoryComment } from '@/lib/memory-comments';
import { radius, space, useColors } from '@/lib/theme';
import type { Memory } from '@/lib/types';

/** The album's paper and ink. The same in light and dark, like a real book. */
const PAPER = {
  page: '#FBF3E2',
  edge: '#EADBC0',
  binding: '#E3D0AE',
  line: '#E6D7BC',
  ink: '#3A2A1F',
  muted: '#8B7259',
  polaroid: '#FFFFFF',
  tape: ['rgba(255, 196, 140, 0.78)', 'rgba(170, 214, 200, 0.78)', 'rgba(244, 170, 196, 0.78)', 'rgba(255, 228, 140, 0.8)'],
  doodles: ['✿', '♡', '☆', '❀', '✦', '♥'],
};

type Page = { kind: 'cover'; key: 'cover' } | { kind: 'memory'; key: string; memory: Memory; number: number } | { kind: 'end'; key: 'end' };

type Props = {
  /** Newest first, as the timeline shows them. The book runs oldest first, like a story. */
  memories: Memory[];
  userId: string;
  myName: string;
  partnerName: string;
  togetherSince: string | null | undefined;
  comments: Map<string, MemoryComment[]>;
  commentsReady: boolean;
  onOpenPhoto: (m: Memory) => void;
  onToggleLove: (m: Memory) => void;
  onLongPressPage: (m: Memory) => void;
  onComment: (m: Memory) => void;
  onDeleteComment: (c: MemoryComment) => void;
  onAdd: () => void;
  bottomInset: number;
};

const TURN_MS = 520;

/**
 * Your memories as a photo album. Swipe (or tap the arrows) to turn a page: it lifts from
 * its spine and folds over to show the next one. Each page has the photo taped in, the
 * caption in handwriting, loves, and comments from both of you.
 */
export function MemoryBook(props: Props) {
  const { memories, bottomInset } = props;
  const reduced = useReducedMotion();
  const pages: Page[] = [
    { kind: 'cover', key: 'cover' },
    ...[...memories].reverse().map((memory, i) => ({ kind: 'memory' as const, key: memory.id, memory, number: i + 1 })),
    { kind: 'end', key: 'end' },
  ];
  const [index, setIndex] = useState(0);
  const at = Math.min(index, pages.length - 1);
  // Which page is lifting: the current one (turning forward) or the one before (turning back).
  const [turning, setTurning] = useState<'next' | 'prev' | null>(null);
  const [turn] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);

  // The pan handlers are made once, so they read the latest values from here.
  const live = useRef({ at: 0, count: 2, width: 0, reduced: false, turning: null as 'next' | 'prev' | null, pending: 'next' as 'next' | 'prev', busy: false });
  useEffect(() => {
    live.current.at = at;
    live.current.count = pages.length;
    live.current.width = width;
    live.current.reduced = reduced;
  }, [at, pages.length, width, reduced]);

  function finish(dir: 'next' | 'prev', done: boolean, velocity = 0) {
    const s = live.current;
    s.busy = true;
    // A page that is turning over ends at 1; one falling back flat ends at 0.
    const to = dir === 'next' ? (done ? 1 : 0) : done ? 0 : 1;
    Animated.timing(turn, {
      toValue: to,
      duration: Math.max(180, TURN_MS * (1 - Math.min(Math.abs(velocity), 2) / 3)),
      easing: Easing.out(Easing.cubic),
      // Driven from JavaScript, the same way as while a finger drags the page.
      useNativeDriver: false,
    }).start(() => {
      if (done) setIndex(s.at + (dir === 'next' ? 1 : -1));
      setTurning(null);
      s.turning = null;
      s.busy = false;
      turn.setValue(0);
    });
  }

  function go(dir: 'next' | 'prev') {
    const s = live.current;
    if (s.busy || s.turning) return;
    if (dir === 'next' ? s.at >= s.count - 1 : s.at <= 0) return;
    if (s.reduced) return setIndex(s.at + (dir === 'next' ? 1 : -1));
    s.turning = dir;
    turn.setValue(dir === 'next' ? 0 : 1);
    setTurning(dir);
    finish(dir, true);
  }

  function jump(to: number) {
    if (live.current.busy || live.current.turning) return;
    setIndex(Math.max(0, Math.min(to, pages.length - 1)));
  }

  // The gesture handlers read `live` only while a finger is down, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const progress = (dir: 'next' | 'prev', dx: number) => {
      const w = live.current.width || 1;
      const p = dir === 'next' ? -dx / w : 1 - dx / w;
      return Math.max(0, Math.min(1, p));
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => {
        const s = live.current;
        if (s.busy || s.turning || Math.abs(g.dx) < 14 || Math.abs(g.dx) < Math.abs(g.dy) * 1.4) return false;
        // The gesture restarts from zero once it's ours, so the direction is decided here.
        s.pending = g.dx < 0 ? 'next' : 'prev';
        return g.dx < 0 ? s.at < s.count - 1 : s.at > 0;
      },
      onPanResponderGrant: () => {
        const s = live.current;
        const dir = s.pending;
        s.turning = dir;
        turn.setValue(dir === 'next' ? 0 : 1);
        setTurning(dir);
      },
      onPanResponderMove: (_, g) => {
        const dir = live.current.turning;
        if (dir) turn.setValue(progress(dir, g.dx));
      },
      onPanResponderRelease: (_, g) => {
        const dir = live.current.turning;
        if (!dir) return;
        const p = progress(dir, g.dx);
        const done = dir === 'next' ? p > 0.3 || g.vx < -0.45 : p < 0.7 || g.vx > 0.45;
        finish(dir, done, g.vx);
      },
      onPanResponderTerminate: () => {
        const dir = live.current.turning;
        if (dir) finish(dir, false);
      },
      onPanResponderTerminationRequest: () => false,
    });
  });

  // Only the page you're on is drawn, plus the one underneath while a page turns.
  const over = turning === 'next' ? at : turning === 'prev' ? at - 1 : null;
  const under = turning === 'next' ? at + 1 : turning === 'prev' ? at : at;
  const shown = (turning === null ? [at] : [under, over as number]).filter((i) => i >= 0 && i < pages.length);

  // The turning page folds in towards the spine: it narrows from its left edge, a flat
  // (2D) take on a page turn that Android draws safely. Never quite zero wide.
  const fold = turn.interpolate({ inputRange: [0, 1], outputRange: [1, 0.02] });
  const foldFade = turn.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });
  const foldShade = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.32, 0.32] });
  const underShade = turn.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] });

  const current = pages[at];
  const memoryCount = pages.length - 2;

  return (
    <View style={{ flex: 1, paddingHorizontal: space.lg, paddingBottom: bottomInset }}>
      <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        {shown.map((i) => {
          const page = pages[i];
          const isOver = i === over;
          const isUnder = turning !== null && i === under;
          const visible = isOver || isUnder || (turning === null && i === at);
          return (
            <Animated.View
              key={page.key}
              pointerEvents={turning === null && i === at ? 'auto' : 'none'}
              importantForAccessibility={turning === null && i === at ? 'auto' : 'no-hide-descendants'}
              accessibilityElementsHidden={!(turning === null && i === at)}
              style={[
                { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: visible ? 1 : 0, zIndex: isOver ? 2 : visible ? 1 : 0 },
                // The page hinges on its left edge: shift that edge to the middle, narrow it, and shift back.
                isOver && width > 0 ? { opacity: foldFade, transform: [{ translateX: -width / 2 }, { scaleX: fold }, { translateX: width / 2 }] } : null,
              ]}>
              <PageView page={page} {...props} memoryCount={memoryCount} onOpenBook={() => go('next')} onNewest={() => jump(pages.length - 2)} onStart={() => jump(1)} />
              {isOver ? <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: foldShade, borderRadius: 18 }} /> : null}
              {isUnder ? <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: underShade, borderRadius: 18 }} /> : null}
            </Animated.View>
          );
        })}
      </View>

      <Row style={{ justifyContent: 'space-between', paddingTop: space.sm }}>
        <TurnButton label="Turn back a page" glyph="prev" disabled={at === 0} onPress={() => go('prev')} />
        <T variant="small" muted style={{ fontWeight: '700' }}>
          {current.kind === 'cover' ? 'Cover' : current.kind === 'end' ? 'The end, for now' : `Page ${current.number} of ${memoryCount}`}
        </T>
        <TurnButton label="Turn to the next page" glyph="next" disabled={at >= pages.length - 1} onPress={() => go('next')} />
      </Row>
    </View>
  );
}

function TurnButton({ label, glyph, disabled, onPress }: { label: string; glyph: 'prev' | 'next'; disabled: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2, opacity: disabled ? 0.35 : 1 }}>
      <Glyph name={glyph} color={c.ink} size={22} />
    </Pressable>
  );
}

/* Pages ------------------------------------------------------------------ */

type PageProps = Props & { page: Page; memoryCount: number; onOpenBook: () => void; onNewest: () => void; onStart: () => void };

function PageView(p: PageProps) {
  if (p.page.kind === 'cover') return <Cover {...p} />;
  if (p.page.kind === 'end') return <EndPage {...p} />;
  return <MemoryPage {...p} memory={p.page.memory} number={p.page.number} />;
}

/** The spine on the left, with stitches, and the paper. */
function Paper({ children, tint }: { children: ReactNode; tint?: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tint ?? PAPER.page,
        borderTopLeftRadius: 6,
        borderBottomLeftRadius: 6,
        borderTopRightRadius: 18,
        borderBottomRightRadius: 18,
        borderWidth: 1,
        borderColor: tint ? 'rgba(0,0,0,0.15)' : PAPER.edge,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 10,
        shadowOffset: { width: 2, height: 4 },
        elevation: 4,
      }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 22, backgroundColor: tint ? 'rgba(0,0,0,0.18)' : PAPER.binding, justifyContent: 'space-evenly', alignItems: 'center' }}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: tint ? 'rgba(255,255,255,0.45)' : PAPER.muted, opacity: 0.7 }} />
        ))}
      </View>
      <View style={{ position: 'absolute', left: 22, top: 0, bottom: 0, width: 10, backgroundColor: 'rgba(0,0,0,0.05)' }} />
      <View style={{ flex: 1, marginLeft: 22 }}>{children}</View>
    </View>
  );
}

function Cover({ myName, partnerName, togetherSince, memoryCount, onOpenBook, onNewest }: PageProps) {
  const c = useColors();
  const since = togetherSince ? parseISODate(togetherSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : null;
  return (
    <Paper tint={c.accent}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md }}>
        <View style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)', borderRadius: radius.lg, paddingVertical: space.xl, paddingHorizontal: space.lg, alignItems: 'center', gap: space.sm, alignSelf: 'stretch' }}>
          <HeartShape size={54} color="rgba(255,255,255,0.9)" />
          <Hand size={34} color={c.onAccent} style={{ textAlign: 'center' }}>
            Our memory book
          </Hand>
          <Hand size={22} color={c.onAccent} style={{ textAlign: 'center', opacity: 0.9 }}>
            {myName} & {partnerName}
          </Hand>
          {since ? (
            <T variant="small" color={c.onAccent} style={{ opacity: 0.85, textAlign: 'center' }}>
              Together since {since}
            </T>
          ) : null}
        </View>
        <T variant="small" color={c.onAccent} style={{ opacity: 0.85, textAlign: 'center' }}>
          {memoryCount === 0 ? 'No pages yet. Add your first memory.' : `${memoryCount} ${memoryCount === 1 ? 'page' : 'pages'} of you two. Swipe to turn the page.`}
        </T>
        {memoryCount > 0 ? (
          <View style={{ gap: space.sm, alignSelf: 'stretch' }}>
            <CoverButton label="Open the book" onPress={onOpenBook} solid />
            {memoryCount > 1 ? <CoverButton label="Go to the newest page" onPress={onNewest} /> : null}
          </View>
        ) : null}
      </View>
    </Paper>
  );
}

function CoverButton({ label, onPress, solid }: { label: string; onPress: () => void; solid?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: radius.pill,
        backgroundColor: solid ? 'rgba(255,255,255,0.92)' : 'transparent',
        borderWidth: solid ? 0 : 1.5,
        borderColor: 'rgba(255,255,255,0.7)',
        opacity: pressed ? 0.8 : 1,
      })}>
      <T style={{ fontWeight: '700' }} color={solid ? c.accent : c.onAccent}>
        {label}
      </T>
    </Pressable>
  );
}

function EndPage({ onAdd, onStart, memoryCount }: PageProps) {
  return (
    <Paper>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md }}>
        <Hand size={40} color={PAPER.ink} style={{ textAlign: 'center' }}>
          The end
        </Hand>
        <Hand size={22} color={PAPER.muted} style={{ textAlign: 'center' }}>
          ...for now. The best pages are still to come.
        </Hand>
        <T style={{ fontSize: 36, lineHeight: 44 }}>💞</T>
        <PaperButton label="Add a memory" onPress={onAdd} />
        {memoryCount > 0 ? <PaperButton label="Back to the first page" onPress={onStart} ghost /> : null}
      </View>
    </Paper>
  );
}

function PaperButton({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingVertical: 10,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        backgroundColor: ghost ? 'transparent' : c.accent,
        borderWidth: ghost ? 1.5 : 0,
        borderColor: PAPER.edge,
        opacity: pressed ? 0.8 : 1,
      })}>
      <T style={{ fontWeight: '700' }} color={ghost ? PAPER.ink : c.onAccent}>
        {label}
      </T>
    </Pressable>
  );
}

function Tape({ color, side }: { color: string; side: 'left' | 'right' }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -12,
        [side]: -14,
        width: 76,
        height: 24,
        backgroundColor: color,
        transform: [{ rotate: side === 'left' ? '-32deg' : '32deg' }],
        zIndex: 2,
      }}
    />
  );
}

function MemoryPage({ memory: m, number, userId, partnerName, comments, commentsReady, onOpenPhoto, onToggleLove, onLongPressPage, onComment, onDeleteComment, myName }: PageProps & { memory: Memory; number: number }) {
  const c = useColors();
  const tilt = number % 2 ? '-2.2deg' : '1.8deg';
  const tape = PAPER.tape[number % PAPER.tape.length];
  const tape2 = PAPER.tape[(number + 2) % PAPER.tape.length];
  const loved = !!m.memory_loves?.some((l) => l.user_id === userId);
  const partnerLoved = !!m.memory_loves?.some((l) => l.user_id !== userId);
  const list = comments.get(m.id) ?? [];
  const doodle = (k: number) => PAPER.doodles[(number + k) % PAPER.doodles.length];
  const by = m.created_by === userId ? 'Added by you' : `Added by ${partnerName}`;

  return (
    <Paper>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.md, gap: space.md }} showsVerticalScrollIndicator={false}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Hand size={16} color={PAPER.muted}>
            {longDate(m.happened_on)}
          </Hand>
          <Hand size={16} color={PAPER.muted}>
            {`~ ${number} ~`}
          </Hand>
        </Row>

        <Pressable onLongPress={() => onLongPressPage(m)} delayLongPress={500} style={{ alignItems: 'center', paddingTop: space.sm }}>
          {m.photo_path ? (
            <Pressable
              onPress={() => onOpenPhoto(m)}
              onLongPress={() => onLongPressPage(m)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Open photo: ${m.caption}`}
              style={{
                backgroundColor: PAPER.polaroid,
                padding: 10,
                paddingBottom: 14,
                width: '92%',
                transform: [{ rotate: tilt }],
                shadowColor: '#000',
                shadowOpacity: 0.22,
                shadowRadius: 6,
                shadowOffset: { width: 1, height: 3 },
                elevation: 3,
              }}>
              <Tape color={tape} side="left" />
              <Tape color={tape2} side="right" />
              <Photo path={m.photo_path} style={{ width: '100%', aspectRatio: 1 }} label={m.caption} />
              <Hand size={20} color={PAPER.ink} style={{ textAlign: 'center', marginTop: 10 }} numberOfLines={4}>
                {m.caption}
              </Hand>
            </Pressable>
          ) : (
            <View style={{ backgroundColor: PAPER.polaroid, padding: space.lg, width: '88%', transform: [{ rotate: tilt }], alignItems: 'center', gap: space.sm, elevation: 2, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 1, height: 2 } }}>
              <Tape color={tape} side="left" />
              <T style={{ fontSize: 44, lineHeight: 54 }}>💞</T>
              <Hand size={22} color={PAPER.ink} style={{ textAlign: 'center' }}>
                {m.caption}
              </Hand>
            </View>
          )}
        </Pressable>

        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: space.xs }}>
          <View style={{ flex: 1, gap: 2 }}>
            {m.place ? (
              <Hand size={17} color={PAPER.ink}>
                {`📍 ${m.place}`}
              </Hand>
            ) : null}
            <Hand size={15} color={PAPER.muted}>
              {by}
            </Hand>
          </View>
          <Pressable
            onPress={() => onToggleLove(m)}
            accessibilityRole="button"
            accessibilityLabel={loved ? 'Remove your love' : 'Love this memory'}
            accessibilityState={{ selected: loved }}
            hitSlop={6}
            style={{ alignItems: 'center', transform: [{ rotate: '-6deg' }] }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: loved ? c.accent : PAPER.muted, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name={loved ? 'heart' : 'heartOutline'} color={loved ? c.accent : PAPER.muted} size={26} />
            </View>
            <Hand size={13} color={loved ? c.accent : PAPER.muted}>
              {loved ? 'Loved' : 'Love'}
            </Hand>
          </Pressable>
        </Row>
        {partnerLoved ? (
          <Hand size={16} color={c.accent}>
            {`${partnerName} loved this ♥`}
          </Hand>
        ) : null}

        {commentsReady ? (
          <View style={{ gap: space.sm, marginTop: space.xs }}>
            <View style={{ height: 1, backgroundColor: PAPER.line }} />
            <Hand size={18} color={PAPER.ink}>
              {list.length ? 'Notes in the margin' : 'No notes on this page yet'}
            </Hand>
            {list.map((cm) => {
              const mine = cm.user_id === userId;
              return (
                <Pressable
                  key={cm.id}
                  onLongPress={mine ? () => onDeleteComment(cm) : undefined}
                  accessibilityLabel={`${mine ? myName : partnerName} wrote: ${cm.body}`}
                  accessibilityHint={mine ? 'Hold to delete your comment' : undefined}
                  style={{ borderBottomWidth: 1, borderBottomColor: PAPER.line, paddingBottom: 6 }}>
                  <Hand size={17} color={PAPER.ink}>
                    <Hand size={17} color={mine ? PAPER.muted : c.accent}>
                      {mine ? 'You' : partnerName}:{' '}
                    </Hand>
                    {cm.body}
                  </Hand>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => onComment(m)}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: PAPER.edge, backgroundColor: pressed ? PAPER.edge : 'transparent' })}>
              <Glyph name="edit" color={PAPER.ink} size={16} />
              <T variant="small" color={PAPER.ink} style={{ fontWeight: '700' }}>
                Write a comment
              </T>
            </Pressable>
          </View>
        ) : null}

        <Row style={{ justifyContent: 'space-between', opacity: 0.35, paddingTop: space.sm }}>
          <Hand size={22} color={PAPER.muted}>
            {doodle(0)}
          </Hand>
          <Hand size={18} color={PAPER.muted}>
            {doodle(2)}
          </Hand>
          <Hand size={24} color={PAPER.muted}>
            {doodle(4)}
          </Hand>
        </Row>
      </ScrollView>
    </Paper>
  );
}
