import { useState, useEffect, useRef, useCallback } from 'react';
import { TransferProgress } from './types';
import { EventsOn } from '../../../wailsjs/runtime/runtime';

const TRANSFER_TIMEOUT_MS = 120_000;

interface TransferCallbacks {
  onComplete?: (direction: string) => void;
  onError?: (filename: string, error: string) => void;
}

export function useTransferState(callbacks?: TransferCallbacks) {
  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const clearTransferTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const resetTimeout = useCallback(() => {
    clearTransferTimeout();
    timeoutRef.current = setTimeout(() => {
      setTransferring(false);
      setProgress(null);
      cbRef.current?.onError?.('', 'Transfer timed out — no response from server');
    }, TRANSFER_TIMEOUT_MS);
  }, [clearTransferTimeout]);

  const startTransfer = useCallback(() => {
    setTransferring(true);
    setProgress(null);
    resetTimeout();
  }, [resetTimeout]);

  useEffect(() => {
    const unsubProgress = EventsOn('transfer:progress', (data: TransferProgress) => {
      setProgress(data);
      resetTimeout();
    });

    const unsubComplete = EventsOn('transfer:complete', (data: { direction: string }) => {
      clearTransferTimeout();
      setTransferring(false);
      setTimeout(() => setProgress(null), 800);
      cbRef.current?.onComplete?.(data.direction);
    });

    const unsubError = EventsOn('transfer:error', (data: { filename: string; direction: string; error: string }) => {
      clearTransferTimeout();
      setTransferring(false);
      setProgress(null);
      cbRef.current?.onError?.(data.filename, data.error);
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
      clearTransferTimeout();
    };
  }, [resetTimeout, clearTransferTimeout]);

  return { transferring, progress, startTransfer };
}
