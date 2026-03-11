import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { WSManager, type WSStatus, type WSMessageHandler, getWSUrl } from '../lib/websocket';

interface WSContextValue {
  manager: WSManager | null;
  status: WSStatus;
}

const WSContext = createContext<WSContextValue>({ manager: null, status: 'disconnected' });

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<WSManager | null>(null);
  const [status, setStatus] = useState<WSStatus>('disconnected');

  useEffect(() => {
    const mgr = new WSManager(getWSUrl());
    managerRef.current = mgr;

    mgr.onStatusChange(setStatus);
    mgr.connect();

    return () => {
      mgr.disconnect();
    };
  }, []);

  return (
    <WSContext.Provider value={{ manager: managerRef.current, status }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWSStatus(): WSStatus {
  return useContext(WSContext).status;
}

export function useWSMessage(type: string, handler: WSMessageHandler) {
  const { manager } = useContext(WSContext);

  useEffect(() => {
    if (!manager) return;
    manager.on(type, handler);
    return () => {
      manager.off(type, handler);
    };
  }, [manager, type, handler]);
}

export function useWSChannel(channel: string, autoSubscribe = true) {
  const { manager, status } = useContext(WSContext);

  const subscribe = useCallback(
    (filter?: Record<string, any>) => {
      manager?.subscribe(channel, filter);
    },
    [manager, channel],
  );

  const unsubscribe = useCallback(() => {
    manager?.unsubscribe(channel);
  }, [manager, channel]);

  useEffect(() => {
    if (!manager || status !== 'connected' || !autoSubscribe) return;
    manager.subscribe(channel);
    return () => {
      manager.unsubscribe(channel);
    };
  }, [manager, status, channel, autoSubscribe]);

  return { subscribe, unsubscribe };
}
