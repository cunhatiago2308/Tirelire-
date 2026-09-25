import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { parseAmount } from '../lib/money.ts';
import { colors } from '../theme.ts';
import { Button, Chip, Field } from './ui.tsx';

/** Small dialog to enter an amount (Alert.prompt only exists on iOS). */
export function AmountModal({
  visible,
  title,
  allowNegative,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  /** Shows a deposit / withdrawal toggle. */
  allowNegative?: boolean;
  onCancel: () => void;
  onSubmit: (amount: number, note: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Mounted only while visible, so the form starts empty each time. */}
      {visible && <AmountForm title={title} allowNegative={allowNegative} onCancel={onCancel} onSubmit={onSubmit} />}
    </Modal>
  );
}

function AmountForm({ title, allowNegative, onCancel, onSubmit }: {
  title: string;
  allowNegative?: boolean;
  onCancel: () => void;
  onSubmit: (amount: number, note: string) => void;
}) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const amount = parseAmount(text);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={styles.sheet}>
        <Text style={styles.title}>{title}</Text>
        {allowNegative && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Ajouter" selected={!withdraw} onPress={() => setWithdraw(false)} color={colors.green} />
            <Chip label="Retirer" selected={withdraw} onPress={() => setWithdraw(true)} color={colors.red} />
          </View>
        )}
        <Field label="Montant (€)" value={text} onChangeText={setText} keyboardType="decimal-pad" autoFocus placeholder="0,00" />
        <Field label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="ex. virement livret" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Annuler" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
          <Button
            title="Valider"
            disabled={!amount}
              onPress={() => amount && onSubmit(withdraw ? -amount : amount, note.trim())}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.card, borderRadius: 18, padding: 20, gap: 14 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
});
