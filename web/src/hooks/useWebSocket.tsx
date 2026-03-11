import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { WSManager, type WSStatus, type WSMessageHandler, getWSUrl } from '../lib/websocket';

interface WSContextValue {
  manager: WSManager | null;
  status: WSStatus;
  isPaused: boolean;
  setPaused: (paused: boolean | ((p: boolean) => boolean)) => void;
}

const WSContext = createContext<WSContextValue>({ 
  manager: null, 
  status: 'disconnected', 
  isPaused: false, 
  setPaused: () => {} 
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<WSManager | null>(null);
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [isPaused, setPaused] = useState(false);

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
    <WSContext.Provider value={{ manager: managerRef.current, status, isPaused, setPaused }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWSStatus(): WSStatus {
  return useContext(WSContext).status;
}

export function useWSMessage(type: string, handler: WSMessageHandler) {
  const { manager, isPaused } = useContext(WSContext);
  const bufferRef = useRef<any[]>([]);

  // handler가 변경되어도 buffer 처리가 안전하게 유지되도록 ref를 사용
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!manager) return;

    const routePayload: WSMessageHandler = (payload) => {
      if (isPaused) {
        // 최대 1000개까지만 버퍼에 담음 (메모리 폭발 방지)
        if (bufferRef.current.length < 1000) {
          bufferRef.current.push(payload);
        }
      } else {
        handlerRef.current(payload);
      }
    };

    manager.on(type, routePayload);
    return () => {
      manager.off(type, routePayload);
    };
  }, [manager, type, isPaused]);

  // paused 해제 시 밀린 버퍼 일괄 처리
  useEffect(() => {
    if (!isPaused && bufferRef.current.length > 0) {
      bufferRef.current.forEach((payload) => {
        handlerRef.current(payload);
      });
      bufferRef.current = [];
    }
  }, [isPaused]);
}

export function useWSPause() {
  const { isPaused, setPaused } = useContext(WSContext);
  return { isPaused, setPaused };
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
