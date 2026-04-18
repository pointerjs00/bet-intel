import { useEffect, useState } from 'react';

// Lazy-require to gracefully handle builds where the native module is not yet linked.
// If the module is unavailable the hook returns a permanently-online state and
// the ConnectivityBanner simply never shows — no crash.
type NetInfoModule = typeof import('@react-native-community/netinfo');
let _netinfo: NetInfoModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _netinfo = require('@react-native-community/netinfo') as NetInfoModule;
} catch {
  // Native module not linked in this build — offline detection unavailable.
}
const NetInfo = _netinfo?.default ?? null;
type NetInfoState = Parameters<NonNullable<typeof NetInfo>['addEventListener']>[0] extends (state: infer S) => void ? S : never;

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

/**
 * Returns the current network connectivity state, updated reactively.
 * `isConnected` is true when the device has a network interface.
 * `isInternetReachable` is true when internet reachability has been confirmed.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    if (!NetInfo) return; // Native module not available — stay online

    // Fetch initial state immediately
    void NetInfo.fetch().then((state: NetInfoState) => {
      setStatus({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable,
      });
    });

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setStatus({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable,
      });
    });

    return unsubscribe;
  }, []);

  return status;
}
