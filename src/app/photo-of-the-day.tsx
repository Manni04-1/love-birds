import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { FloatingHearts } from '@/components/floating-hearts';
import { BackHeader } from '@/components/game-ui';
import { HeartShape, useReducedMotion } from '@/components/hero';
import { Photo } from '@/components/photo';
import { PhotoViewer, type ViewerPhoto } from '@/components/photo-viewer';
import { Avatar, Button, ErrorText, Field, Glyph, Row, T } from '@/components/ui';
import { likeDailyPhoto, saveDailyPhoto, useDailyPhotos, type DailyPhoto } from '@/lib/daily';
import { dayLabel, today } from '@/lib/dates';
import { pickPhoto, takePhoto, uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { useCouple } from '@/lib/session';
import { friendlyError } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';

/**
 * One tap opens the photo full screen; two quick taps like it (when `onLike` is given).
 * A big heart pops on the photo when it's liked this way.
 */
function TappablePhoto({
  path,
  label,
  liked,
  onLike,
  onOpen,
  style,
}: {
  path: string;
  label: string;
  liked: boolean;
  onLike?: () => void;
  onOpen: () => void;
  style: { aspectRatio: number; borderRadius: number };
}) {
  const reduced = useReducedMotion();
  const lastTap = useRef<{ at: number; timer: ReturnType<typeof setTimeout> | null }>({ at: 0, timer: null });
  const [pop] = useState(() => new Animated.Value(0));

  function tap() {
    const at = Date.now();
    const last = lastTap.current;
    if (last.timer) clearTimeout(last.timer);
    if (!onLike) return onOpen();
    if (at - last.at < 300) {
      lastTap.current = { at: 0, timer: null };
      if (!liked) onLike();
      if (!reduced) {
        pop.setValue(0);
        Animated.sequence([
          Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
          Animated.timing(pop, { toValue: 0, duration: 250, delay: 350, useNativeDriver: true }),
        ]).start();
      }
      return;
    }
    lastTap.current = { at, timer: setTimeout(onOpen, 300) };
  }

  return (
    <Pressable onPress={tap} accessibilityRole="imagebutton" accessibilityLabel={label} accessibilityHint={onLike && !liked ? 'Opens the photo. Double tap quickly to like it.' : 'Opens the photo.'}>
      <Photo path={path} label={label} style={style} />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pop,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}>
        <HeartShape size={96} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  );
}

/** The heart to like or unlike your partner's photo. */
function LikeButton({ liked, onPress, small }: { liked: boolean; onPress: () => void; small?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityState={{ selected: liked }}
      accessibilityLabel={liked ? 'Unlike this photo' : 'Like this photo'}
      style={{ padding: small ? 8 : 4 }}>
      <Glyph name={liked ? 'heart' : 'heartOutline'} color={liked ? c.accent : c.muted} size={small ? 18 : 26} />
    </Pressable>
  );
}

function Polaroid({
  name,
  partner,
  photo,
  waiting,
  liked,
  onLike,
  likedNote,
  onOpen,
}: {
  name: string;
  partner?: boolean;
  photo: DailyPhoto | null;
  waiting: string;
  liked: boolean;
  /** Your partner's photo: like or unlike it. */
  onLike?: (like: boolean) => void;
  /** Your own photo: what to say once your partner has liked it. */
  likedNote?: string;
  onOpen: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: space.sm, paddingBottom: space.md, gap: space.sm }}>
      {photo?.photo_path ? (
        <TappablePhoto
          path={photo.photo_path}
          label={`${name}'s photo of the day`}
          liked={liked}
          onLike={onLike ? () => onLike(true) : undefined}
          onOpen={onOpen}
          style={{ aspectRatio: 1, borderRadius: radius.md }}
        />
      ) : (
        <View style={{ aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.sm }}>
          <Glyph name={photo ? 'lock' : 'photo'} color={c.muted} size={30} />
          <T variant="small" muted style={{ textAlign: 'center' }}>
            {waiting}
          </T>
        </View>
      )}
      <Row gap={space.sm} style={{ paddingHorizontal: 4 }}>
        <Avatar name={name} partner={partner} size={28} />
        <T variant="small" style={{ flex: 1 }} numberOfLines={3}>
          <T variant="small" style={{ fontWeight: '700' }}>
            {name}
          </T>
          {photo?.caption ? `  ${photo.caption}` : ''}
        </T>
        {onLike && photo?.photo_path ? <LikeButton liked={liked} onPress={() => onLike(!liked)} /> : null}
      </Row>
      {likedNote && liked ? (
        <Row gap={6} style={{ paddingHorizontal: 4 }}>
          <Glyph name="heart" color={c.accent} size={14} />
          <T variant="small" color={c.accent} style={{ fontWeight: '700' }}>
            {likedNote}
          </T>
        </Row>
      ) : null}
    </View>
  );
}

export default function PhotoOfTheDay() {
  const c = useColors();
  const ctx = useCouple();
  const { today: t, past, loaded, reload } = useDailyPhotos(ctx?.userId, 14);
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [caption, setCaption] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Likes you've just tapped, shown straight away while they save. Keyed by day.
  const [myLikes, setMyLikes] = useState<Map<string, boolean>>(new Map());
  const [burst, setBurst] = useState(0);
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; start: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      reload();
      const timer = setInterval(reload, 15000);
      return () => clearInterval(timer);
    }, [reload]),
  );

  if (!ctx) return null;
  const { profile, partner, couple, userId } = ctx;

  async function choose(from: 'camera' | 'gallery') {
    setError('');
    try {
      const p = from === 'camera' ? await takePhoto() : await pickPhoto();
      if (p) setPicked(p);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function share() {
    if (!picked) return setError('Choose a photo first.');
    setError('');
    setBusy(true);
    try {
      const path = await uploadPhoto(couple.id, picked);
      await saveDailyPhoto(couple.id, userId, path, caption);
      setPicked(null);
      setCaption('');
      setSwapping(false);
      await reload();
    } catch (e) {
      setError(friendlyError(e));
    }
    setBusy(false);
  }

  /** Whether you've liked your partner's photo for a day. */
  function likedTheirs(day: string, p: DailyPhoto | null) {
    return myLikes.get(day) ?? !!p?.liked_at;
  }

  async function like(day: string, value: boolean) {
    setError('');
    setMyLikes((prev) => new Map(prev).set(day, value));
    if (value) setBurst((n) => n + 1);
    try {
      await likeDailyPhoto(day, value);
      await reload();
    } catch (e) {
      setError(friendlyError(e));
    }
    setMyLikes((prev) => {
      const next = new Map(prev);
      next.delete(day);
      return next;
    });
  }

  function open(p: DailyPhoto | null, who: string) {
    if (p?.photo_path) setViewer({ photos: [{ path: p.photo_path, caption: p.caption, note: who }], start: 0 });
  }

  const showPicker = loaded && (!t?.mine || swapping);
  const todayLabel = today().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <ThemeBackdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader title="Photo of the day" home="/" />
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          <T variant="eyebrow">{todayLabel}</T>
          <T variant="title">{showPicker ? 'Share a moment from today' : 'Today, side by side'}</T>

          {showPicker && (
            <>
              <T muted>
                {t?.partner && !swapping
                  ? `${partner.name} has added theirs. Add yours to see it.`
                  : `Anything at all: your lunch, the view, your face. You'll see ${partner.name}'s once you've both added one.`}
              </T>
              <Pressable
                onPress={() => choose('camera')}
                accessibilityRole="button"
                accessibilityLabel={picked ? 'Take a different photo' : 'Take a photo'}
                style={{
                  aspectRatio: 1,
                  borderRadius: radius.lg,
                  borderWidth: 1.5,
                  borderStyle: picked ? 'solid' : 'dashed',
                  borderColor: c.line,
                  backgroundColor: c.surface,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}>
                {picked ? (
                  <Image source={{ uri: picked.uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
                ) : (
                  <>
                    <T style={{ fontSize: 44, lineHeight: 54 }}>📸</T>
                    <T muted style={{ fontWeight: '700' }}>
                      Tap to take a photo
                    </T>
                  </>
                )}
              </Pressable>
              <Row gap={space.sm}>
                <Button style={{ flex: 1 }} title="Camera" variant="outline" icon={<Glyph name="camera" color={c.ink} size={18} />} onPress={() => choose('camera')} />
                <Button style={{ flex: 1 }} title="Gallery" variant="outline" icon={<Glyph name="photo" color={c.ink} size={18} />} onPress={() => choose('gallery')} />
              </Row>
              <Field label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={140} placeholder="e.g. Chai break thinking of you" />
              <ErrorText>{error}</ErrorText>
              <Button title={swapping ? 'Swap my photo' : 'Share my photo'} onPress={share} loading={busy} disabled={!picked} />
              {swapping && <Button title="Keep the one I have" variant="ghost" onPress={() => setSwapping(false)} />}
            </>
          )}

          {loaded && t?.mine && !swapping && (
            <>
              <Polaroid
                name={partner.name}
                partner
                photo={t.partner}
                waiting={`Waiting for ${partner.name}'s photo. You'll get a notification.`}
                liked={likedTheirs(t.day, t.partner)}
                onLike={(v) => like(t.day, v)}
                onOpen={() => open(t.partner, partner.name)}
              />
              <Polaroid name={profile.name} photo={t.mine} waiting="" liked={!!t.mine.liked_at} likedNote={`${partner.name} loved this`} onOpen={() => open(t.mine, profile.name)} />
              {t.partner?.photo_path && !likedTheirs(t.day, t.partner) ? (
                <T variant="fine" style={{ textAlign: 'center' }}>
                  {`Double tap ${partner.name}'s photo to like it.`}
                </T>
              ) : null}
              <ErrorText>{error}</ErrorText>
              <Button title="Swap my photo" variant="outline" onPress={() => setSwapping(true)} />
            </>
          )}

          {past.length > 0 && (
            <T variant="strong" style={{ marginTop: space.md }}>
              Earlier days
            </T>
          )}
          {past.map((d) => (
            <View key={d.day} style={{ gap: space.sm }}>
              <T variant="fine">{dayLabel(d.day)}</T>
              <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                {[
                  { who: profile.name, p: d.mine, mine: true, liked: !!d.mine?.liked_at, canLike: false },
                  // You can like their photo only on days you added one too, since that's when you can see it.
                  { who: partner.name, p: d.partner, mine: false, liked: likedTheirs(d.day, d.partner), canLike: !!d.mine && !!d.partner?.photo_path },
                ].map(({ who, p, mine, liked, canLike }) => (
                  <View key={who + String(mine)} style={{ flex: 1, gap: 4 }}>
                    {p?.photo_path ? (
                      <View>
                        <TappablePhoto
                          path={p.photo_path}
                          label={`${who}'s photo`}
                          liked={liked}
                          onLike={canLike ? () => like(d.day, true) : undefined}
                          onOpen={() => open(p, who)}
                          style={{ aspectRatio: 1, borderRadius: radius.md }}
                        />
                        {canLike ? (
                          <View style={{ position: 'absolute', right: 4, bottom: 4, backgroundColor: c.surface, borderRadius: 999 }}>
                            <LikeButton small liked={liked} onPress={() => like(d.day, !liked)} />
                          </View>
                        ) : liked ? (
                          <View
                            style={{ position: 'absolute', right: 4, bottom: 4, backgroundColor: c.surface, borderRadius: 999, padding: 8 }}
                            accessible
                            accessibilityLabel={`${partner.name} loved this`}>
                            <Glyph name="heart" color={c.accent} size={18} />
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <View style={{ aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', padding: space.sm }}>
                        <T variant="fine" style={{ textAlign: 'center' }}>
                          {p ? 'Hidden, because you skipped this one' : 'No photo'}
                        </T>
                      </View>
                    )}
                    <T variant="fine" numberOfLines={2}>
                      <T variant="fine" style={{ fontWeight: '700' }} color={c.ink}>
                        {who}
                      </T>
                      {p?.caption ? `  ${p.caption}` : ''}
                    </T>
                  </View>
                ))}
              </Row>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
      <FloatingHearts burst={burst} />
      <PhotoViewer photos={viewer?.photos ?? []} start={viewer ? viewer.start : null} onClose={() => setViewer(null)} />
    </SafeAreaView>
  );
}
