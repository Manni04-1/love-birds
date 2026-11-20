import { useState } from 'react';
import { Pressable } from 'react-native';

import { Button, ErrorText, Field, Glyph, Row, Sheet, T } from '@/components/ui';
import { changePassword, newPasswordProblem, PASSWORD_MIN } from '@/lib/passwords';
import { useColors } from '@/lib/theme';

/** Settings > Account > Change password. */
export function ChangePassword({ open, email, onDone, onClose }: { open: boolean; email: string; onDone: () => void; onClose: () => void }) {
  const c = useColors();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Opening it again starts empty.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCurrent('');
      setNext('');
      setAgain('');
      setError('');
    }
  }

  async function save() {
    setError('');
    const problem = newPasswordProblem(next, again);
    if (problem) return setError(problem);
    setBusy(true);
    const err = await changePassword(email, current, next);
    setBusy(false);
    if (err) return setError(err);
    onDone();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="heading">Change password</T>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Glyph name="close" color={c.muted} size={22} />
        </Pressable>
      </Row>
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" textContentType="password" />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder={`At least ${PASSWORD_MIN} characters`}
      />
      <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={save} />
      <ErrorText>{error}</ErrorText>
      <Button title="Change password" onPress={save} loading={busy} />
    </Sheet>
  );
}
