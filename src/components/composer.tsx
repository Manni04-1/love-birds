import { useImperativeHandle, useRef, useState, type ComponentRef, type Ref } from 'react';
import { TextInput } from 'react-native';

import { Glyph, IconButton, Row } from '@/components/ui';
import { space, tabBarInset, useColors } from '@/lib/theme';

export type ComposerHandle = {
  getText: () => string;
  setText: (text: string) => void;
  focus: () => void;
};

/**
 * The message box at the bottom of the chat. It keeps what you type to itself, so typing redraws only
 * this row and not every message above it.
 */
export function Composer({
  ref,
  editing,
  hasPhotos,
  onSend,
  onLater,
  onSticker,
  onPhoto,
  onVoice,
  onTyping,
}: {
  ref: Ref<ComposerHandle>;
  editing: boolean;
  /** Photos are waiting to be sent, so the send button shows even with nothing typed. */
  hasPhotos: boolean;
  onSend: () => void;
  onLater: () => void;
  onSticker: () => void;
  onPhoto: () => void;
  onVoice: () => void;
  onTyping: () => void;
}) {
  const c = useColors();
  const [text, setText] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const textNow = useRef('');

  useImperativeHandle(ref, () => ({
    getText: () => textNow.current,
    setText: (t: string) => {
      textNow.current = t;
      setText(t);
    },
    focus: () => input.current?.focus(),
  }));

  const typed = !!text.trim();

  return (
    <Row
      gap={space.sm}
      style={{
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
        paddingBottom: tabBarInset + space.sm,
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: c.surface,
      }}>
      {!editing && !typed && !hasPhotos && (
        <IconButton label="Send a sticker" onPress={onSticker}>
          <Glyph name="smile" color={c.ink} />
        </IconButton>
      )}
      {!editing && (
        <IconButton label={hasPhotos ? 'Add more photos' : 'Send photos'} onPress={onPhoto}>
          <Glyph name="photo" color={c.ink} />
        </IconButton>
      )}
      <TextInput
        ref={input}
        value={text}
        onChangeText={(t) => {
          textNow.current = t;
          setText(t);
          if (t.trim()) onTyping();
        }}
        placeholder={editing ? 'Change your message' : hasPhotos ? 'Add a caption' : 'Message'}
        placeholderTextColor={c.muted}
        accessibilityLabel="Message"
        multiline
        maxLength={4000}
        style={{
          flex: 1,
          minHeight: 44,
          maxHeight: 120,
          borderWidth: 1.5,
          borderColor: c.line,
          borderRadius: 22,
          paddingHorizontal: 16,
          paddingTop: 11,
          paddingBottom: 11,
          backgroundColor: c.page,
          color: c.ink,
          fontSize: 16,
        }}
      />
      {typed && !editing && !hasPhotos && (
        <IconButton label="Send later" onPress={onLater}>
          <Glyph name="clock" color={c.ink} />
        </IconButton>
      )}
      {!editing && !typed && !hasPhotos ? (
        <IconButton label="Record a voice note" accent onPress={onVoice}>
          <Glyph name="mic" color={c.onAccent} />
        </IconButton>
      ) : (
        <IconButton label={editing ? 'Save change' : 'Send'} accent onPress={onSend}>
          <Glyph name={editing ? 'check' : 'send'} color={c.onAccent} />
        </IconButton>
      )}
    </Row>
  );
}
