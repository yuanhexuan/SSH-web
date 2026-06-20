export type AuthType = 'password' | 'key';
export type ConnectionMode = 'https-ssh' | 'direct';

export interface ConnectionConfig {
  sessionId: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  mode: ConnectionMode;
}

export interface ConnectionHistory {
  id: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  mode: ConnectionMode;
  label?: string;
  lastConnected: number;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  mode: number;
  mtime: number;
  isDirectory: boolean;
}

export type WSMessageType =
  | 'ssh-connect' | 'ssh-connected' | 'ssh-error' | 'ssh-disconnected'
  | 'terminal-input' | 'terminal-output' | 'terminal-resize'
  | 'file-operation' | 'file-result'
  | 'ssh-disconnect';

export interface WSMessage {
  type: WSMessageType;
  sessionId: string;
  [key: string]: any;
}
