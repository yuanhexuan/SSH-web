import { create } from 'zustand';
import type { ConnectionConfig, ConnectionHistory, FileEntry } from '@/types';

const HISTORY_KEY = 'ssh-connection-history';

interface SSHState {
  connections: Map<string, ConnectionConfig>;
  activeSessionId: string | null;
  sessions: Array<{ id: string; label: string; config: ConnectionConfig }>;
  connectionHistory: ConnectionHistory[];
  currentPath: string;
  fileList: FileEntry[];

  addConnection: (config: ConnectionConfig) => void;
  removeConnection: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  addSession: (session: { id: string; label: string; config: ConnectionConfig }) => void;
  removeSession: (sessionId: string) => void;
  addHistory: (config: ConnectionConfig) => void;
  removeHistory: (id: string) => void;
  setCurrentPath: (path: string) => void;
  setFileList: (files: FileEntry[]) => void;
  loadHistory: () => void;
}

export const useSSHStore = create<SSHState>((set, get) => ({
  connections: new Map(),
  activeSessionId: null,
  sessions: [],
  connectionHistory: [],
  currentPath: '/',
  fileList: [],

  addConnection: (config) =>
    set((state) => {
      const next = new Map(state.connections);
      next.set(config.sessionId, config);
      return { connections: next };
    }),

  removeConnection: (sessionId) =>
    set((state) => {
      const next = new Map(state.connections);
      next.delete(sessionId);
      return { connections: next };
    }),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),

  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
    })),

  addHistory: (config) => {
    const history: ConnectionHistory = {
      id: config.sessionId,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      mode: config.mode,
      lastConnected: Date.now(),
    };
    set((state) => {
      const filtered = state.connectionHistory.filter(
        (h) => !(h.host === history.host && h.username === history.username && h.port === history.port)
      );
      const next = [history, ...filtered].slice(0, 20);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return { connectionHistory: next };
    });
  },

  removeHistory: (id) =>
    set((state) => {
      const next = state.connectionHistory.filter((h) => h.id !== id);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return { connectionHistory: next };
    }),

  setCurrentPath: (path) => set({ currentPath: path }),

  setFileList: (files) => set({ fileList: files }),

  loadHistory: () => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ConnectionHistory[];
        set({ connectionHistory: parsed });
      }
    } catch {}
  },
}));
