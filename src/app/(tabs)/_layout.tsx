import { Text } from 'react-native';
import { Link } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { colors } from '../../theme.ts';

// Emoji icons: no icon font to download, works offline in Expo Go.
const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', headerTitle: 'Tirelire', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historique',
          tabBarIcon: icon('📜'),
          headerRight: () => (
            <Link href="/import" style={{ color: colors.primary, fontWeight: '600', marginRight: 16 }}>
              ⤓ Importer un relevé
            </Link>
          ),
        }}
      />
      <Tabs.Screen name="sales" options={{ title: 'Ventes', tabBarIcon: icon('🏷️') }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: icon('📊') }} />
      <Tabs.Screen name="settings" options={{ title: 'Réglages', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
