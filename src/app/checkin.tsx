import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/game-ui';
import { Avatar, Button, Card, ErrorText, Field, Glyph, Row, T } from '@/components/ui';
import { saveCheckin, useCheckins, type Checkin } from '@/lib/daily';
import { clockLabel, dayLabel, today } from '@/lib/dates';
import { refreshEveningReminder } from '@/lib/notifications';
import { useCouple } from '@/lib/session';
import { friendlyError } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';

const PARTS = [
  { key: 'rose', emoji: '🌹', label: 'Rose', hint: 'The best bit of your day' },
  { key: 'thorn', emoji: '🌵', label: 'Thorn', hint: 'Something hard or annoying' },
  { key: 'bud', emoji: '🌱', label: 'Bud', hint: 'Something you\'re looking forward to' },
] as const;

function Lines({ checkin }: { checkin: Checkin }) {
  return (
    <View style={{ gap: space.sm }}>
      {PARTS.map((p) =>
        checkin[p.key] ? (
          <Row key={p.key} gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <T style={{ fontSize: 18, lineHeight: 23 }}>{p.emoji}</T>
            <T style={{ flex: 1 }}>{checkin[p.key]}</T>
          </Row>
        ) : null,
      )}
    </View>
  );
}

export default function CheckinScreen() {
  const c = useColors();
  const ctx = useCouple();
  const { today: t, past, loaded, reload } = useCheckins(ctx?.userId, 14);
  const [rose, setRose] = useState('');
  const [thorn, setThorn] = useState('');
  const [bud, setBud] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      reload();
      // Check again now and then, so your partner's check-in appears without leaving the screen.
      const timer = setInterval(reload, 15000);
      return () => clearInterval(timer);
    }, [reload]),
  );

  if (!ctx) return null;
  const { profile, partner, couple } = ctx;

  async function submit() {
    setError('');
    if (!rose.trim()) return setError('Start with your rose: the best bit of today.');
    setBusy(true);
    try {
      await saveCheckin(couple.id, rose, thorn, bud);
      setRose('');
      setThorn('');
      setBud('');
      await reload();
      refreshEveningReminder(couple.id);
    } catch (e) {
      setError(friendlyError(e));
    }
    setBusy(false);
  }

  const values = { rose, thorn, bud };
  const setters = { rose: setRose, thorn: setThorn, bud: setBud };
  const todayLabel = today().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <BackHeader title="Rose, thorn and bud" home="/" />
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          <T variant="eyebrow">{todayLabel}</T>
          <T variant="title">How was your day?</T>

          {loaded && !t?.mine && (
            <>
              <Card>
                <Row gap={space.md}>
                  <Avatar name={partner.name} partner size={38} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="small" muted style={{ fontWeight: '700' }}>
                      {t?.partner ? `${partner.name} checked in at ${clockLabel(t.partner.created_at)}` : `${partner.name} hasn't checked in yet`}
                    </T>
                    <Row gap={6}>
                      <Glyph name="lock" color={c.muted} size={14} />
                      <T variant="small" muted>
                        Share yours to see theirs
                      </T>
                    </Row>
                  </View>
                </Row>
              </Card>
              {PARTS.map((p) => (
                <Field
                  key={p.key}
                  label={`${p.emoji} ${p.label}${p.key === 'rose' ? '' : ' (optional)'}`}
                  placeholder={p.hint}
                  value={values[p.key]}
                  onChangeText={setters[p.key]}
                  multiline
                  maxLength={500}
                  style={{ minHeight: 70 }}
                />
              ))}
              <ErrorText>{error}</ErrorText>
              <Button title="Share my day" onPress={submit} loading={busy} />
              <T variant="fine">Once shared it stays as it is, like a little diary of your evenings together.</T>
            </>
          )}

          {t?.mine && (
            <>
              <Card style={{ gap: space.sm }}>
                <Row gap={space.sm}>
                  <Avatar name={profile.name} size={30} />
                  <T variant="small" muted style={{ fontWeight: '700' }}>
                    You
                  </T>
                </Row>
                <Lines checkin={t.mine} />
              </Card>
              <Card style={{ gap: space.sm }}>
                <Row gap={space.sm}>
                  <Avatar name={partner.name} partner size={30} />
                  <T variant="small" muted style={{ fontWeight: '700' }}>
                    {partner.name}
                  </T>
                </Row>
                {t.partner?.rose ? (
                  <Lines checkin={t.partner} />
                ) : (
                  <T muted>Waiting for {partner.name}. You&apos;ll get a notification when they share.</T>
                )}
              </Card>
            </>
          )}

          {past.length > 0 && (
            <T variant="strong" style={{ marginTop: space.md }}>
              Earlier evenings
            </T>
          )}
          {past.map((d) => (
            <Card key={d.day} style={{ gap: space.sm }}>
              <T variant="fine">{dayLabel(d.day)}</T>
              <T variant="small" muted style={{ fontWeight: '700' }}>
                You
              </T>
              {d.mine ? <Lines checkin={d.mine} /> : <T variant="small" muted>No check-in</T>}
              <T variant="small" muted style={{ fontWeight: '700', marginTop: 4 }}>
                {partner.name}
              </T>
              {d.partner?.rose ? (
                <Lines checkin={d.partner} />
              ) : (
                <T variant="small" muted>
                  {d.partner ? 'Hidden, because you skipped this one' : 'No check-in'}
                </T>
              )}
            </Card>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
