import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeBackdrop } from '@/components/backdrop';
import { LoveBirdsMark } from '@/components/mark';
import { Button, Card, T } from '@/components/ui';
import { isConfigured } from '@/lib/supabase';
import { space, useColors } from '@/lib/theme';

export default function Welcome() {
  const c = useColors();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.page }]}>
      <ThemeBackdrop />
      <View style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: c.accent }]}>
          <LoveBirdsMark size={92} />
        </View>
        <T variant="display" style={{ textAlign: 'center' }}>
          Love Birds
        </T>
        <T muted style={{ textAlign: 'center', fontSize: 18, lineHeight: 25, maxWidth: 260 }}>
          A private space for just the two of you.
        </T>
      </View>

      {!isConfigured && (
        <Card tone="soft">
          <T variant="strong">The app isn&apos;t connected to its database yet</T>
          <T variant="small">Add your Supabase URL and key to the .env file, then restart. The README explains how.</T>
        </Card>
      )}

      <View style={{ gap: space.sm }}>
        <Button title="Create our space" onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signup' } })} />
        <Button title="I already have an account" variant="outline" onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'signin' } })} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  logo: { width: 128, height: 128, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
