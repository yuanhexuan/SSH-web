import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { sshService, type SSHConfig } from './services/ssh.js'
import type { ClientChannel, SFTPWrapper, FileEntry, Stats } from 'ssh2'

interface WSMessage {
  type: string
  [key: string]: unknown
}

interface FileOperationMessage extends WSMessage {
  type: 'file-operation'
  sessionId: string
  operation: string
  path?: string
  oldPath?: string
  newPath?: string
  content?: string
  mode?: number
}

interface SSHConnectMessage extends WSMessage {
  type: 'ssh-connect'
  sessionId: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKey?: string
  passphrase?: string
  mode: 'https-ssh' | 'direct'
  cols?: number
  rows?: number
}

interface TerminalInputMessage extends WSMessage {
  type: 'terminal-input'
  sessionId: string
  data: string
}

interface TerminalResizeMessage extends WSMessage {
  type: 'terminal-resize'
  sessionId: string
  cols: number
  rows: number
}

interface SSHDisconnectMessage extends WSMessage {
  type: 'ssh-disconnect'
  sessionId: string
}

export function setupWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' })

  // Track sessions per WebSocket connection
  const wsSessions = new WeakMap<WebSocket, Set<string>>()

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected')
    wsSessions.set(ws, new Set())

    ws.on('message', async (raw: Buffer) => {
      let message: WSMessage
      try {
        message = JSON.parse(raw.toString())
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }))
        return
      }

      switch (message.type) {
        case 'ssh-connect':
          await handleSSHConnect(ws, message as SSHConnectMessage, wsSessions)
          break
        case 'terminal-input':
          handleTerminalInput(ws, message as TerminalInputMessage)
          break
        case 'terminal-resize':
          handleTerminalResize(ws, message as TerminalResizeMessage)
          break
        case 'file-operation':
          await handleFileOperation(ws, message as FileOperationMessage)
          break
        case 'ssh-disconnect':
          handleSSHDisconnect(ws, message as SSHDisconnectMessage)
          break
        default:
          ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }))
      }
    })

    ws.on('close', () => {
      console.log('WebSocket client disconnected')
      // Clean up all SSH sessions for this connection
      const sessions = wsSessions.get(ws)
      if (sessions) {
        for (const sessionId of sessions) {
          sshService.disconnect(sessionId)
        }
      }
    })

    ws.on('error', (err) => {
      console.error('WebSocket error:', err)
    })
  })
}

async function handleSSHConnect(ws: WebSocket, message: SSHConnectMessage, wsSessions: WeakMap<WebSocket, Set<string>>): Promise<void> {
  const { sessionId, cols, rows } = message

  // Track session for this WebSocket connection
  const sessions = wsSessions.get(ws)
  if (sessions) {
    sessions.add(sessionId)
  }

  const config: SSHConfig = {
    host: message.host,
    port: message.port,
    username: message.username,
    authType: message.authType,
    password: message.password,
    privateKey: message.privateKey,
    passphrase: message.passphrase,
    mode: message.mode,
  }

  try {
    const client = await sshService.createConnection(sessionId, config)

    client.shell(
      {
        term: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
      },
      (err, stream: ClientChannel) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'ssh-error', sessionId, message: err.message }))
          sshService.disconnect(sessionId)
          return
        }

        sshService.setStream(sessionId, stream)

        stream.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'terminal-output', sessionId, data: data.toString('base64') }))
          }
        })

        stream.on('close', () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ssh-disconnected', sessionId }))
          }
          sshService.disconnect(sessionId)
        })

        if (stream.stderr) {
          stream.stderr.on('data', (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'terminal-output', sessionId, data: data.toString('base64') }))
            }
          })
        }

        ws.send(JSON.stringify({ type: 'ssh-connected', sessionId }))
      }
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    ws.send(JSON.stringify({ type: 'ssh-error', sessionId, message: errorMessage }))
  }
}

function handleTerminalInput(ws: WebSocket, message: TerminalInputMessage): void {
  const { sessionId, data } = message
  const conn = sshService.getConnection(sessionId)
  if (conn?.stream) {
    conn.stream.write(data)
  }
}

function handleTerminalResize(ws: WebSocket, message: TerminalResizeMessage): void {
  const { sessionId, cols, rows } = message
  const conn = sshService.getConnection(sessionId)
  if (conn?.stream) {
    conn.stream.setWindow(rows, cols, 0, 0)
  }
}

async function handleFileOperation(ws: WebSocket, message: FileOperationMessage): Promise<void> {
  const { sessionId, operation } = message

  try {
    const sftp = (await sshService.createSFTP(sessionId)) as SFTPWrapper

    switch (operation) {
      case 'list': {
        const dirPath = message.path || '/'
        sftp.readdir(dirPath, (err: Error | null, list: FileEntry[]) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: err.message }))
            return
          }
          const fileList = list.map((entry) => ({
            name: entry.filename,
            path: dirPath === '/' ? `/${entry.filename}` : `${dirPath}/${entry.filename}`,
            size: entry.attrs.size,
            mode: entry.attrs.mode,
            mtime: entry.attrs.mtime,
            isDirectory: (entry.attrs.mode & 0o40000) !== 0,
          }))
          ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true, files: fileList }))
        })
        break
      }

      case 'read': {
        const filePath = message.path || ''
        sftp.readFile(filePath, (err: Error | null, data: Buffer) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: err.message }))
            return
          }
          ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true, content: data.toString('utf-8') }))
        })
        break
      }

      case 'write': {
        const filePath = message.path || ''
        const content = message.content || ''
        const buffer = Buffer.from(content, 'utf-8')
        sftp.writeFile(filePath, buffer, (err: Error | null) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: err.message }))
            return
          }
          ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true }))
        })
        break
      }

      case 'download': {
        const filePath = message.path || ''
        sftp.readFile(filePath, (err: Error | null, data: Buffer) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: err.message }))
            return
          }
          ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true, content: data.toString('base64') }))
        })
        break
      }

      case 'upload': {
        const filePath = message.path || ''
        const content = message.content || ''
        const buffer = Buffer.from(content, 'base64')
        sftp.writeFile(filePath, buffer, (err: Error | null) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: err.message }))
            return
          }
          ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true }))
        })
        break
      }

      case 'mkdir': {
        const dirPath = message.path || ''
        sftp.mkdir(dirPath, (err: Error | null) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: err.message }))
            return
          }
          ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true }))
        })
        break
      }

      case 'delete': {
        const filePath = message.path || ''
        const conn = sshService.getConnection(sessionId)
        if (!conn) {
          ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: 'No SSH connection' }))
          return
        }
        // Try stat first to determine if it's a directory
        sftp.stat(filePath, (err: Error | null, stats: Stats) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: err.message }))
            return
          }
          const isDir = (stats.mode & 0o40000) !== 0
          if (isDir) {
            sftp.rmdir(filePath, (rmdirErr: Error | null) => {
              if (rmdirErr) {
                ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: rmdirErr.message }))
                return
              }
              ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true }))
            })
          } else {
            sftp.unlink(filePath, (unlinkErr: Error | null) => {
              if (unlinkErr) {
                ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: unlinkErr.message }))
                return
              }
              ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true }))
            })
          }
        })
        break
      }

      case 'rename': {
        const oldPath = message.path || ''
        const newPath = message.newPath || ''
        sftp.rename(oldPath, newPath, (err: Error | null) => {
          if (err) {
            ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: err.message }))
            return
          }
          ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: true }))
        })
        break
      }

      default:
        ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: `Unknown file operation: ${operation}` }))
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    ws.send(JSON.stringify({ type: 'file-result', sessionId, operation, success: false, error: errorMessage }))
  }
}

function handleSSHDisconnect(ws: WebSocket, message: SSHDisconnectMessage): void {
  const { sessionId } = message
  sshService.disconnect(sessionId)
  ws.send(JSON.stringify({ type: 'ssh-disconnected', sessionId }))
}
