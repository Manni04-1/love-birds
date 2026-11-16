import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useSignedUrl } from '@/lib/photos';
import { useColors } from '@/lib/theme';
import { Glyph } from './ui';

/** Shows a photo from the couple's private storage, or a soft placeholder. */
export function Photo({ path, style, label }: { path: string | null | undefined; style?: StyleProp<ViewStyle>; label?: string }) {
  const c = useColors();
  const url = useSignedUrl(path);
  return (
    <View style={[{ backgroundColor: c.accentSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {url ? (
        <Image
          source={{ uri: url, cacheKey: path ?? undefined }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          transition={200}
          accessibilityLabel={label ?? 'Photo'}
        />
      ) : (
        <Glyph name={path ? 'photo' : 'heart'} color={c.accent} size={28} />
      )}
    </View>
  );
}
