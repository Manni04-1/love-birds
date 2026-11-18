import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, DateField, ErrorText, Field, Glyph, Row, T } from '@/components/ui';
import { toISODate, today } from '@/lib/dates';
import { pickPhoto, uploadPhoto, type PickedPhoto } from '@/lib/photos';
import { useCouple } from '@/lib/session';
import { friendlyError, supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';

export default function NewMemory() {
  const c = useColors();
  const ctx = useCouple();
  // caption, day and match come from a date you did: match marks it done.
  // bucket comes from a bucket list dream you ticked off: the memory is linked to it.
  const params = useLocalSearchParams<{ caption?: string; day?: string; match?: string; bucket?: string }>();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [caption, setCaption] = useState(params.caption ?? '');
  const [day, setDay] = useState<string | null>(params.day ?? toISODate(today()));
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!ctx) return null;
  const { couple, partner } = ctx;

  async function save() {
    setError('');
    if (!caption.trim()) return setError('Add a few words about this memory.');
    setBusy(true);
    try {
      const photo_path = photo ? await uploadPhoto(couple.id, photo) : null;
      const happened_on = day ?? toISODate(today());
      const { data, error: err } = await supabase
        .from('memories')
        .insert({
          couple_id: couple.id,
          caption: caption.trim(),
          happened_on,
          place: place.trim() || null,
          photo_path,
        })
        .select('id')
        .single();
      if (err) throw err;
      if (params.match && data) {
        // Best effort: the memory is saved either way.
        await supabase.from('date_matches').update({ done_on: happened_on, memory_id: data.id }).eq('couple_id', couple.id).eq('idea_id', params.match);
      }
      if (params.bucket && data) {
        await supabase.from('bucket_items').update({ memory_id: data.id }).eq('couple_id', couple.id).eq('id', params.bucket);
      }
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
          <T variant="title">{params.match ? 'How was your date?' : params.bucket ? 'You did it! 🎉' : 'New memory'}</T>
          <Pressable
            onPress={async () => {
              const p = await pickPhoto();
              if (p) setPhoto(p);
            }}
            accessibilityRole="button"
            accessibilityLabel={photo ? 'Change photo' : 'Add a photo'}
            style={{ aspectRatio: 16 / 10, borderRadius: radius.md, borderWidth: 1.5, borderStyle: photo ? 'solid' : 'dashed', borderColor: c.line, backgroundColor: c.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
            ) : (
              <>
                <Glyph name="photo" color={c.muted} size={30} />
                <T muted style={{ fontWeight: '700' }}>
                  Add a photo
                </T>
              </>
            )}
          </Pressable>
          <Field label="What happened?" value={caption} onChangeText={setCaption} multiline placeholder="e.g. Dancing in the kitchen at midnight" maxLength={1000} />
          <Row style={{ alignItems: 'flex-start' }}>
            <DateField label="Date" value={day} onChange={setDay} maximumDate={today()} />
          </Row>
          <Field label="Place" value={place} onChangeText={setPlace} placeholder="Optional" maxLength={120} />
          <ErrorText>{error}</ErrorText>
          <Row>
            <Button style={{ flex: 1 }} title="Cancel" variant="outline" onPress={() => router.back()} />
            <Button style={{ flex: 1 }} title="Save memory" onPress={save} loading={busy} />
          </Row>
          <T variant="fine" style={{ textAlign: 'center' }}>
            Only you and {partner.name} can see this.
          </T>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
