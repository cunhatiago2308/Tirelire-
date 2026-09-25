import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { migrate } from '../db/schema.ts';
import { colors } from '../theme.ts';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="tirelire.db" onInit={migrate}>
      <StatusBar style="dark" />
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
      </Stack>
    </SQLiteProvider>
  );
}
