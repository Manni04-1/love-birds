import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Sheet, T } from '@/components/ui';
import { ANIMALS } from '@/content/animals';
import { parseSticker, STICKER_CAPTIONS } from '@/content/stickers';
import { radius, space, useColors } from '@/lib/theme';

/** An animal sticker: the animal in a soft circle, a little extra emoji, and a caption. */
export function StickerArt({ sticker, size = 92 }: { sticker: string; size?: number }) {
  const c = useColors();
  const s = parseSticker(sticker);
  if (!s) return null;
  return (
    <View style={{ alignItems: 'center', paddingTop: size * 0.08 }} accessible accessibilityLabel={`Sticker: ${s.text}`}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.accentSoft,
          borderWidth: 3,
          borderColor: c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <T style={{ fontSize: size * 0.56, lineHeight: size * 0.7 }} allowFontScaling={false}>
          {s.emoji}
        </T>
        <T style={{ position: 'absolute', right: -size * 0.1, top: -size * 0.08, fontSize: size * 0.3, lineHeight: size * 0.38 }} allowFontScaling={false}>
          {s.extra}
        </T>
      </View>
      <View style={{ marginTop: -size * 0.14, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: c.accent, transform: [{ rotate: '-4deg' }] }}>
        <T variant={size >= 80 ? 'small' : 'fine'} color={c.onAccent} style={{ fontWeight: '800' }} allowFontScaling={false}>
          {s.text}
        </T>
      </View>
    </View>
  );
}

/** Pick an animal and a caption, and the sticker sends straight away. */
export function StickerPicker({ open, onClose, onPick, animal }: { open: boolean; onClose: () => void; onPick: (sticker: string) => void; animal?: string | null }) {
  const c = useColors();
  const [chosen, setChosen] = useState<string | null>(null);
  const current = chosen ?? (ANIMALS.some((a) => a.key === animal) ? animal! : 'love-bird');
  return (
    <Sheet open={open} onClose={onClose}>
      <T variant="heading">Send a sticker</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {ANIMALS.map((a) => {
          const on = a.key === current;
          return (
            <Pressable
              key={a.key}
              onPress={() => setChosen(a.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={a.label}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: on ? c.accent : 'transparent',
                backgroundColor: on ? c.accentSoft : c.surface,
              }}>
              <T style={{ fontSize: 24, lineHeight: 30 }}>{a.emoji}</T>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space.md }}>
        {STICKER_CAPTIONS.map((cap) => (
          <Pressable
            key={cap.key}
            onPress={() => onPick(`${current}:${cap.key}`)}
            accessibilityRole="button"
            accessibilityLabel={`Send ${cap.text}`}
            style={({ pressed }) => ({ width: '24%', alignItems: 'center', opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
            <StickerArt sticker={`${current}:${cap.key}`} size={56} />
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}
