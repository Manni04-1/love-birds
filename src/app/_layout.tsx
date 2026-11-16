import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { SessionProvider, useSession } from '@/lib/session';
import { useColors } from '@/lib/theme';
import { useAppUpdates } from '@/lib/updates';

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { ready, session, partner } = useSession();
  const c = useColors();
  useAppUpdates();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = !!session;
  const linked = signedIn && !!partner;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }}>
      {/* Not signed in */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" />
      </Stack.Protected>

      {/* Signed in, waiting to link with a partner */}
      <Stack.Protected guard={signedIn && !linked}>
        <Stack.Screen name="link" />
      </Stack.Protected>

      {/* Linked couple */}
      <Stack.Protected guard={linked}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="question" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="new-plan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="new-memory" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <StatusBar style="auto" />
        <Routes />
      </SessionProvider>
    </ThemeProvider>
  );
}
