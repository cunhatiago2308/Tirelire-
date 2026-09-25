import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { migrate } from '../db/schema.ts';
import { APP_NAME, colors } from '../theme.ts';
import { Button } from './ui.tsx';

// On the web, the database file can only be opened by one tab/window at a time (browser file
// locks). Opening the app twice (browser tab + installed app) used to leave the second one on a
// black screen. Each window now holds a Web Lock while it uses the database; a second window
// explains the situation and opens the data as soon as the first one is closed.

const LOCK = 'tirelire-db';
const hasWebLocks = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.locks;

let lockHeld: Promise<void> | null = null;
const waitingListeners = new Set<() => void>();
let waiting = false;

/** Resolves once this window holds the lock (kept until the window closes). Requested once per page. */
function acquireDbLock(): Promise<void> {
  lockHeld ??= new Promise<void>((resolve) => {
    const holdForever = () => {
      resolve();
      return new Promise<void>(() => {});
    };
    navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => {
      if (lock) return holdForever();
      waiting = true;
      waitingListeners.forEach((l) => l());
      return navigator.locks.request(LOCK, holdForever);
    });
  });
  return lockHeld;
}

function isLockedElsewhere(e: Error): boolean {
  return e.name === 'NoModificationAllowedError' || /Access Handle|NoModificationAllowed/i.test(String(e.message ?? e));
}

export function DbGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!hasWebLocks);
  const [otherWindow, setOtherWindow] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!hasWebLocks) return;
    let active = true;
    const onWaiting = () => active && setOtherWindow(true);
    waitingListeners.add(onWaiting);
    if (waiting) onWaiting();
    acquireDbLock().then(() => active && setReady(true));
    return () => {
      active = false;
      waitingListeners.delete(onWaiting);
    };
  }, []);

  // A window still running an older version doesn't take the lock: the file error tells us instead.
  const lockedByOldVersion = error != null && isLockedElsewhere(error);

  if (!ready || lockedByOldVersion) {
    if (!otherWindow && !lockedByOldVersion) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
    return (
      <Message title="Déjà ouverte ailleurs">
        {APP_NAME} est déjà ouverte dans un autre onglet ou une autre fenêtre (navigateur ou appli installée). Tes
        données ne peuvent être ouvertes qu'à un seul endroit à la fois.{'\n\n'}
        Ferme l'autre onglet ou fenêtre{lockedByOldVersion ? ', puis touche Réessayer.' : ' : l’appli s’ouvre ici toute seule.'}
      </Message>
    );
  }

  if (error) return <Message title="Impossible d'ouvrir les données">{String(error.message ?? error)}</Message>;

  return (
    <SQLiteProvider databaseName="tirelire.db" onInit={migrate} onError={setError}>
      {children}
    </SQLiteProvider>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 28, gap: 16 }}>
      <Text style={{ fontSize: 26, fontWeight: '900', color: colors.text }}>
        {APP_NAME.replace(/\+$/, '')}
        <Text style={{ color: colors.primary }}>+</Text>
      </Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 15, color: colors.muted, lineHeight: 22 }}>{children}</Text>
      {Platform.OS === 'web' && <Button title="Réessayer" onPress={() => window.location.reload()} />}
    </View>
  );
}
