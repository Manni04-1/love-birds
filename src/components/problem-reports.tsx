import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, ErrorText, T } from '@/components/ui';
import { clearMyProblemReports, loadProblemReports, reportText, sendProblemReports, type SentReport } from '@/lib/crash-reports';
import { clockLabel, dayLabel, toISODate } from '@/lib/dates';
import { friendlyError } from '@/lib/supabase';
import { radius, space, useColors } from '@/lib/theme';

function when(iso: string): string {
  return `${dayLabel(toISODate(new Date(iso)))}, ${clockLabel(iso)}`;
}

/**
 * Settings > Problem reports: what went wrong lately on either phone, so it can be copied
 * and sent to whoever fixes the app.
 */
export function ProblemReports({ coupleId, userId, myName, partnerName }: { coupleId: string; userId: string; myName: string; partnerName: string }) {
  const c = useColors();
  const [list, setList] = useState<SentReport[] | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function show() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await sendProblemReports(coupleId);
      setList(await loadProblemReports());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, what: string) {
    await Clipboard.setStringAsync(text);
    setNote(`${what} copied. Paste it into a message to send it on.`);
  }

  async function clearMine() {
    setBusy(true);
    try {
      await clearMyProblemReports(userId);
      setList(await loadProblemReports());
      setNote('Your reports are cleared.');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (list === undefined) {
    return (
      <View style={{ gap: space.sm }}>
        <T variant="small" muted>
          If Love Birds closes by itself or something breaks, the app notes down what went wrong and sends it here the next time it opens.
        </T>
        <Button title="Show problem reports" variant="outline" onPress={show} loading={busy} />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
    );
  }

  if (list === null) {
    return (
      <T variant="small" muted>
        {`Problem reports aren't switched on yet. They start once app-errors.sql has been run in Supabase.`}
      </T>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      {list.length === 0 ? (
        <T variant="small" muted>
          Nothing has gone wrong lately.
        </T>
      ) : (
        list.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => copy(reportText(r), 'Report')}
            accessibilityRole="button"
            accessibilityHint="Copies this report"
            style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, backgroundColor: pressed ? c.accentSoft : c.surface2, gap: 2 })}>
            <T variant="small" style={{ fontWeight: '700' }}>
              {`${r.kind} · ${r.user_id === userId ? myName : partnerName} · ${when(r.happened_at)}`}
            </T>
            <T variant="small" muted numberOfLines={3}>
              {r.message}
            </T>
          </Pressable>
        ))
      )}
      {list.length ? (
        <>
          <T variant="fine">Tap a report to copy it.</T>
          <Button title="Copy all" variant="outline" onPress={() => copy(list.map(reportText).join('\n\n---\n\n'), 'All reports')} />
          {list.some((r) => r.user_id === userId) ? <Button title="Clear mine" variant="ghost" onPress={clearMine} loading={busy} /> : null}
        </>
      ) : null}
      {note ? (
        <T variant="small" muted>
          {note}
        </T>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}
