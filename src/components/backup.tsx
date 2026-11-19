import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { Button, ErrorText, ProgressBar, T } from '@/components/ui';
import { clearFinishedBackup, describeBackup, readBackupSetting, startBackup, stopBackup, useBackupRun, type BackupSetting, type Progress } from '@/lib/backup';
import { pickFolder, type FolderRef } from '@/lib/backup-folder';
import { clockLabel, dayLabel, toISODate } from '@/lib/dates';
import { space } from '@/lib/theme';

/** Says what the phone's folder picker wants before it opens. False if you'd rather not. */
function explainPicker(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(true);
  return new Promise((resolve) =>
    Alert.alert(
      'Choose where to keep it',
      'On the next screen, make a new folder (for example Love Birds) and open it. Then tap Use this folder, and Allow.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Choose folder', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

/** "today at 9:12 AM", "yesterday at 8:30 PM" or "on Tue 24 Nov at 7:05 AM". */
function when(iso: string): string {
  const day = dayLabel(toISODate(new Date(iso)));
  return `${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : `on ${day}`} at ${clockLabel(iso)}`;
}

function progressText(p: Progress): string {
  if (p.phase === 'data') return 'Gathering your chat, plans, memories and answers…';
  if (!p.total) return 'Finishing…';
  return `Saving photos and voice notes: ${p.done} of ${p.total}`;
}

// The first tenth of the bar is the gathering, the rest the photos and voice notes.
const fraction = (p: Progress) => (p.phase === 'data' ? 0.1 * (p.done / (p.total || 1)) : 0.1 + 0.9 * (p.total ? p.done / p.total : 1));

const items = (n: number) => `${n} new ${n === 1 ? 'photo or voice note' : 'photos and voice notes'}`;
const missingText = (n: number) =>
  n === 1 ? 'One photo or voice note is missing from the app’s storage, so it couldn’t be saved.' : `${n} photos and voice notes are missing from the app’s storage, so they couldn’t be saved.`;

/** The Backup part of Settings. */
export function BackupControls({ coupleId, userId }: { coupleId: string; userId: string }) {
  const run = useBackupRun();
  const [setting, setSetting] = useState<BackupSetting | null>(null);
  const [error, setError] = useState('');

  // Where backups go and how the last one went, read again after each backup.
  useEffect(() => {
    if (run.state === 'running') return;
    let active = true;
    readBackupSetting().then((s) => {
      if (active) setSetting(s);
    });
    return () => {
      active = false;
    };
  }, [run.state]);

  useEffect(() => clearFinishedBackup, []);

  async function save(chooseAgain: boolean) {
    setError('');
    let folder: FolderRef | null | undefined = chooseAgain ? null : setting?.folder;
    if (!folder) {
      if (!(await explainPicker())) return;
      try {
        folder = await pickFolder();
      } catch (e) {
        return setError(e instanceof Error ? e.message : 'Couldn’t open the folder picker. Try again.');
      }
      if (!folder) return;
    }
    startBackup(coupleId, userId, folder);
  }

  const running = run.state === 'running';
  const last = setting?.last;
  return (
    <>
      <T variant="small" muted>
        Saves a copy of everything to a folder on this phone: your chat, photos, voice notes, plans, memories, answers and letters. Each backup only adds
        what’s new since the last one.
      </T>
      {running ? (
        <View style={{ gap: space.sm }}>
          <T variant="small">{progressText(run.progress)}</T>
          <ProgressBar value={fraction(run.progress)} label="Backup progress" />
          <T variant="fine">Keep Love Birds open until it’s done.</T>
          <Button title="Stop" variant="outline" onPress={stopBackup} />
        </View>
      ) : (
        <Button title="Save a backup" onPress={() => save(false)} disabled={!setting} />
      )}
      {run.state === 'done' ? (
        <View style={{ gap: 2 }}>
          <T variant="small" accent style={{ fontWeight: '700' }}>
            ✓ Saved to {run.summary.folder}
          </T>
          <T variant="small" muted>
            {describeBackup(run.summary)}.{run.summary.added ? ` Added ${items(run.summary.added)}.` : ' Nothing new since the last backup.'}
            {run.summary.missing ? ` ${missingText(run.summary.missing)}` : ''}
          </T>
        </View>
      ) : null}
      {run.state === 'stopped' ? (
        <T variant="small" muted>
          Stopped. Tap Save a backup to carry on where it left off.
        </T>
      ) : null}
      <ErrorText>{run.state === 'failed' ? run.message : error}</ErrorText>
      {!running && run.state !== 'done' && last ? (
        <T variant="small" muted>
          Last saved {when(last.at)} to {last.folder}: {describeBackup(last)}.
        </T>
      ) : null}
      {!running && setting?.folder ? <Button title="Choose another folder" variant="ghost" onPress={() => save(true)} /> : null}
      <T variant="fine">The backup isn’t locked: anyone who opens the Files app on this phone can read it.</T>
    </>
  );
}
