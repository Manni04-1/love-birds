import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans/700Bold';
import { NunitoSans_800ExtraBold } from '@expo-google-fonts/nunito-sans/800ExtraBold';
import { Fredoka_400Regular } from '@expo-google-fonts/fredoka/400Regular';
import { Fredoka_500Medium } from '@expo-google-fonts/fredoka/500Medium';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { Kalam_700Bold } from '@expo-google-fonts/kalam/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppLock } from '@/components/app-lock';
import { Intro } from '@/components/intro';
import { SessionProvider, useSession } from '@/lib/session';
import { FontNameProvider, isFontName, isThemeName, setCustomFonts, ThemeNameProvider, useColors } from '@/lib/theme';
import { useAppUpdates } from '@/lib/updates';

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { ready, session, partner } = useSession();
  const c = useColors();
  useAppUpdates();

  // The splash screen hands over to the opening animation (Intro), which fades out once this is ready.
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
        <Stack.Screen name="new-idea" options={{ presentation: 'modal' }} />
        <Stack.Screen name="matches" />
        <Stack.Screen name="wyr" />
        <Stack.Screen name="quiz" />
        <Stack.Screen name="talk" />
        <Stack.Screen name="checkin" />
        <Stack.Screen name="photo-of-the-day" />
        <Stack.Screen name="letters" />
        <Stack.Screen name="bucket-list" />
        <Stack.Screen name="live" />
        <Stack.Screen name="tonight" />
        <Stack.Screen name="lists" />
        <Stack.Screen name="chat-search" />
        <Stack.Screen name="wishlist" />
        <Stack.Screen name="our-story" />
        <Stack.Screen name="coupons" />
        <Stack.Screen name="trip-fund" />
        <Stack.Screen name="recap" />
      </Stack.Protected>
    </Stack>
  );
}

/** Each of you picks your own theme in Settings. */
function Themed({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const theme = isThemeName(profile?.theme) ? profile.theme : 'rose';
  const font = isFontName(profile?.font) ? profile.font : 'classic';
  return (
    <ThemeNameProvider value={theme}>
      <FontNameProvider value={font}>{children}</FontNameProvider>
    </ThemeNameProvider>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Kalam_700Bold,
  });
  // If the fonts can't load, the app carries on with the phone's own font.
  setCustomFonts(fontsLoaded);
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SessionProvider>
          <Themed>
            <StatusBar style="auto" />
            <AppLock>
              <Routes />
            </AppLock>
            <Intro />
          </Themed>
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
