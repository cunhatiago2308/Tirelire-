import { useEffect } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DbGate } from '../components/DbGate.tsx';
import { colors } from '../theme.ts';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

/** Web version (installed from the browser): offline cache + ask the browser not to evict our data. */
function useWebAppSetup() {
  useEffect(() => {
    if (Platform.OS !== 'web' || __DEV__) return;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.storage?.persist?.().catch(() => {});
  }, []);
}

export default function RootLayout() {
  useWebAppSetup();
  return (
    <ThemeProvider value={navTheme}>
      <DbGate>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.bg },
            headerBackTitle: 'Retour',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="add" options={{ presentation: 'modal', title: 'Ajouter' }} />
          <Stack.Screen name="category/[id]" options={{ presentation: 'modal', title: 'Catégorie' }} />
          <Stack.Screen name="recurring/[id]" options={{ presentation: 'modal', title: 'Dépense fixe' }} />
          <Stack.Screen name="goal" options={{ presentation: 'modal', title: "Objectif d'épargne" }} />
          <Stack.Screen name="import" options={{ title: 'Relevé bancaire' }} />
          <Stack.Screen name="rules" options={{ title: 'Règles de catégorisation' }} />
          <Stack.Screen name="simulator" options={{ title: "Simulateur d'épargne" }} />
        </Stack>
      </DbGate>
    </ThemeProvider>
  );
}
