import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import { ShareBoletinSheet } from './ShareBoletinSheet';

interface ShareBoletinRequest {
  boletinId: string;
  boletinName?: string | null;
  onShared?: () => void;
}

interface ShareBoletinContextValue {
  openShareBoletinSheet: (request: ShareBoletinRequest) => void;
  closeShareBoletinSheet: () => void;
}

const ShareBoletinContext = createContext<ShareBoletinContextValue | null>(null);

export function ShareBoletinProvider({ children }: { children: React.ReactNode }) {
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const [request, setRequest] = useState<ShareBoletinRequest | null>(null);

  useEffect(() => {
    if (!request) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      sheetRef.current?.snapToIndex(0);
    });

    return () => cancelAnimationFrame(frame);
  }, [request]);

  const openShareBoletinSheet = useCallback((nextRequest: ShareBoletinRequest) => {
    setRequest(nextRequest);
  }, []);

  const closeShareBoletinSheet = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  const handleClose = useCallback(() => {
    setRequest(null);
  }, []);

  const value = useMemo(
    () => ({
      openShareBoletinSheet,
      closeShareBoletinSheet,
    }),
    [closeShareBoletinSheet, openShareBoletinSheet],
  );

  return (
    <ShareBoletinContext.Provider value={value}>
      {children}
      <ShareBoletinSheet
        ref={sheetRef}
        boletinId={request?.boletinId ?? ''}
        boletinName={request?.boletinName}
        onClose={handleClose}
        onShared={request?.onShared}
      />
    </ShareBoletinContext.Provider>
  );
}

export function useShareBoletinSheet(): ShareBoletinContextValue {
  const context = useContext(ShareBoletinContext);

  if (!context) {
    throw new Error('useShareBoletinSheet must be used within ShareBoletinProvider');
  }

  return context;
}