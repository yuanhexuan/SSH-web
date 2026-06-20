import { useState, useRef, useCallback, useEffect } from 'react';
import type { WSMessage } from '@/types';

interface UseWebSocketReturn {
  connect: () => void;
  send: (message: WSMessage) => void;
  disconnect: () => void;
  isConnected: boolean;
  lastMessage: WSMessage | null;
}

// Singleton WebSocket - shared across all hook instances
let sharedWs: WebSocket | null = null;
let sharedWsUrl = '';
let sharedIsConnected = false;
const listeners = new Set<(msg: WSMessage) => void>();
const connectionListeners = new Set<(connected: boolean) => void>();
let retryCount = 0;
const MAX_RETRIES = 5;
let manualClose = false;
const messageQueue: WSMessage[] = [];

function getWsUrl(): string {
  if (import.meta.env.DEV) {
    return 'ws://localhost:3001/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function connectShared() {
  const url = getWsUrl();
  if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  manualClose = false;
  sharedWsUrl = url;
  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('[WS] Connected');
    sharedIsConnected = true;
    retryCount = 0;
    connectionListeners.forEach((fn) => fn(true));
    // Send queued messages
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift()!;
      ws.send(JSON.stringify(msg));
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as WSMessage;
      listeners.forEach((fn) => fn(msg));
    } catch {
      // ignore
    }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected');
    sharedIsConnected = false;
    sharedWs = null;
    connectionListeners.forEach((fn) => fn(false));

    if (!manualClose && retryCount < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      retryCount++;
      console.log(`[WS] Reconnecting in ${delay}ms (attempt ${retryCount})`);
      setTimeout(connectShared, delay);
    }
  };

  ws.onerror = () => {
    ws.close();
  };

  sharedWs = ws;
}

function sendShared(message: WSMessage) {
  if (sharedWs?.readyState === WebSocket.OPEN) {
    sharedWs.send(JSON.stringify(message));
  } else if (sharedWs?.readyState === WebSocket.CONNECTING) {
    messageQueue.push(message);
  }
}

function disconnectShared() {
  manualClose = true;
  retryCount = MAX_RETRIES;
  messageQueue.length = 0;
  sharedWs?.close();
  sharedWs = null;
  sharedIsConnected = false;
}

export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(sharedIsConnected);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  const messageHandler = useRef<(msg: WSMessage) => void | null>(null);
  const connectionHandler = useRef<(connected: boolean) => void | null>(null);

  messageHandler.current = (msg: WSMessage) => {
    setLastMessage(msg);
  };

  connectionHandler.current = (connected: boolean) => {
    setIsConnected(connected);
  };

  useEffect(() => {
    listeners.add(messageHandler.current!);
    connectionListeners.add(connectionHandler.current!);

    // Auto-connect if not connected
    if (!sharedWs || sharedWs.readyState === WebSocket.CLOSED) {
      connectShared();
    }

    // Sync initial state
    setIsConnected(sharedIsConnected);

    return () => {
      listeners.delete(messageHandler.current!);
      connectionListeners.delete(connectionHandler.current!);
      // Don't disconnect on unmount - shared connection persists
    };
  }, []);

  const connect = useCallback(() => {
    connectShared();
  }, []);

  const send = useCallback((message: WSMessage) => {
    sendShared(message);
  }, []);

  const disconnect = useCallback(() => {
    disconnectShared();
  }, []);

  return { connect, send, disconnect, isConnected, lastMessage };
}
