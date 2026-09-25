import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import type { TxType } from '../db/types.ts';
import { colors, onColor } from '../theme.ts';

/** Floating "+" button, always reachable: opens the quick-add sheet. */
export function Fab({ type }: { type?: TxType }) {
  return (
    <Pressable
      accessibilityLabel="Ajouter une opération"
      onPress={() => router.push(type ? { pathname: '/add', params: { type } } : '/add')}
      style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <Text style={styles.plus}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  plus: { color: onColor(colors.primary), fontSize: 34, lineHeight: 38, fontWeight: '300' },
});
