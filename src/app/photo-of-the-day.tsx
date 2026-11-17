import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/game-ui';
import { Photo } from '@/components/photo';
import { Avatar, Button, ErrorText, Field, Glyph, Row, T } from '@/components/ui';
import { saveDailyPhoto, useDailyPhotos, type DailyPhoto } from '@/lib/daily';
import { dayLabel, today } from '@/lib/dates';
import { pickPhoto, uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { useCouple } from '@/lib/session';
import { friendlyError } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';

function Polaroid({ name, partner, photo, waiting }: { name: string; partner?: boolean; photo: DailyPhoto | null; waiting: string }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: space.sm, paddingBottom: space.md, gap: space.sm }}>
      {photo?.photo_path ? (
        <Photo path={photo.photo_path} label={`${name}'s photo of the day`} style={{ aspectRatio: 1, borderRadius: radius.md }} />
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
      </Row>
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

  useFocusEffect(
    useCallback(() => {
      reload();
      const timer = setInterval(reload, 15000);
      return () => clearInterval(timer);
    }, [reload]),
  );

  if (!ctx) return null;
  const { profile, partner, couple, userId } = ctx;

  async function choose() {
    setError('');
    try {
      const p = await pickPhoto();
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

  const showPicker = loaded && (!t?.mine || swapping);
  const todayLabel = today().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                onPress={choose}
                accessibilityRole="button"
                accessibilityLabel={picked ? 'Choose a different photo' : 'Choose a photo'}
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
                      Choose a photo
                    </T>
                  </>
                )}
              </Pressable>
              <Field label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={140} placeholder="e.g. Chai break thinking of you" />
              <ErrorText>{error}</ErrorText>
              <Button title={swapping ? 'Swap my photo' : 'Share my photo'} onPress={share} loading={busy} disabled={!picked} />
              {swapping && <Button title="Keep the one I have" variant="ghost" onPress={() => setSwapping(false)} />}
            </>
          )}

          {loaded && t?.mine && !swapping && (
            <>
              <Polaroid name={partner.name} partner photo={t.partner} waiting={`Waiting for ${partner.name}'s photo. You'll get a notification.`} />
              <Polaroid name={profile.name} photo={t.mine} waiting="" />
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
                  { who: profile.name, p: d.mine, mine: true },
                  { who: partner.name, p: d.partner, mine: false },
                ].map(({ who, p, mine }) => (
                  <View key={who + String(mine)} style={{ flex: 1, gap: 4 }}>
                    {p?.photo_path ? (
                      <Photo path={p.photo_path} label={`${who}'s photo`} style={{ aspectRatio: 1, borderRadius: radius.md }} />
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
    </SafeAreaView>
  );
}
