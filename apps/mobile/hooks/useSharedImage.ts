import { useEffect } from 'react';
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Handles Android share intents for images.
 * When another app (e.g. Betclic) shares a screenshot to BetIntel this hook:
 *  - On cold start: reads the pending URI from the native module and navigates.
 *  - While running:  listens for the DeviceEventEmitter event and navigates.
 * Both paths open the scan screen with the shared image pre-loaded.
 */
export function useSharedImage() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const { SharedImageModule } = NativeModules;
    if (!SharedImageModule) return;

    // Cold-start: image was shared while app was not running
    SharedImageModule.getInitialSharedImageUri()
      .then((uri: string | null) => {
        if (uri) {
          router.push({ pathname: '/boletins/scan', params: { sharedImageUri: uri } });
        }
      })
      .catch(() => {
        // Ignore – module may not be registered in dev builds without re-build
      });

    // Foreground: image shared while app was already running
    const sub = DeviceEventEmitter.addListener(
      'BetIntelSharedImage',
      ({ filePath }: { filePath: string }) => {
        router.push({ pathname: '/boletins/scan', params: { sharedImageUri: filePath } });
      },
    );

    return () => sub.remove();
    // router is stable from expo-router, eslint can be silenced for this dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
