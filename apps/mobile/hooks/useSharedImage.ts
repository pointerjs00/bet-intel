import { useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Handles Android share intents for images (e.g. a Betclic boletim screenshot shared to BetIntel).
 *
 * The shared image is queued and the import screen opens only once there is a session: on a cold
 * start the session is still being restored (or the login screen is shown), and navigating right
 * away was undone by the auth redirect, so the user landed on Início and the image was lost.
 */
export function useSharedImage(isAuthenticated: boolean, isHydrating: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const { SharedImageModule } = NativeModules;
    if (!SharedImageModule) return undefined;

    // Cold start: image shared while the app was not running.
    SharedImageModule.getInitialSharedImageUri()
      .then((uri: string | null) => { if (uri) setPending(uri); })
      .catch(() => undefined);

    // Foreground: image shared while the app was already running.
    const sub = DeviceEventEmitter.addListener('BetIntelSharedImage', ({ filePath }: { filePath: string }) => {
      if (filePath) setPending(filePath);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pending || isHydrating || !isAuthenticated || opened.current === pending) return undefined;
    // Let the auth redirect to the tabs settle first, then open the import on top of it.
    const t = setTimeout(() => {
      opened.current = pending;
      setPending(null);
      router.push({ pathname: '/boletins/scan', params: { sharedImageUri: pending } });
    }, 400);
    return () => clearTimeout(t);
  }, [pending, isAuthenticated, isHydrating, router]);
}
