import { useState, useRef, useCallback, useEffect } from 'react';
import type { WSMessage } from '@/types';

interface UseWebSocketReturn {
  connect: () => void;
  send: (message: WSMessage) => void;
  disconnect: () => void;
  isConnected: boolean;
  lastMessage: WSMessage | null;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const retriesRef = useRef(0);
  const maxRetries = 5;
  const manualCloseRef = useRef(false);

  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    manualCloseRef.current = false;

    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      setIsConnected(true);
      retriesRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        setLastMessage(msg);
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      if (!manualCloseRef.current && retriesRef.current < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000);
        retriesRef.current += 1;
        setTimeout(() => connect(), delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [getWsUrl]);

  const send = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    retriesRef.current = maxRetries;
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      manualCloseRef.current = true;
      wsRef.current?.close();
    };
  }, []);

  return { connect, send, disconnect, isConnected, lastMessage };
}
