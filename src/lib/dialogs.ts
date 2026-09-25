import { Alert, Platform } from 'react-native';

// Alert.alert does nothing on the web version (react-native-web): fall back to the browser dialogs.

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

/** Destructive confirmation: "Annuler" / `confirmLabel`. */
export function confirmAction(title: string, message: string | undefined, confirmLabel: string, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annuler', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
