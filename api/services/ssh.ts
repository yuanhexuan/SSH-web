import { Client, type ClientChannel } from 'ssh2'

export interface SSHConfig {
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKey?: string
  passphrase?: string
  mode: 'https-ssh' | 'direct'
}

interface SSHConnection {
  client: Client
  stream: ClientChannel | null
}

const CONNECTION_TIMEOUT = 15000

class SSHService {
  private connections: Map<string, SSHConnection> = new Map()

  createConnection(sessionId: string, config: SSHConfig): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client()

      const connectConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: CONNECTION_TIMEOUT,
        connectTimeout: CONNECTION_TIMEOUT,
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else {
        connectConfig.privateKey = config.privateKey
        if (config.passphrase) {
          connectConfig.passphrase = config.passphrase
        }
      }

      let settled = false

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          client.end()
          reject(new Error(`连接超时: 无法在 ${CONNECTION_TIMEOUT / 1000} 秒内连接到 ${config.host}:${config.port}`))
        }
      }, CONNECTION_TIMEOUT + 2000)

      client.on('ready', () => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          this.connections.set(sessionId, { client, stream: null })
          console.log(`SSH connected: ${config.username}@${config.host}:${config.port} [${sessionId}]`)
          resolve(client)
        }
      })

      client.on('error', (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          console.error(`SSH error for ${sessionId}:`, err.message)
          reject(err)
        }
      })

      client.on('close', () => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(new Error('SSH 连接已关闭'))
        }
      })

      console.log(`SSH connecting: ${config.username}@${config.host}:${config.port} [${sessionId}]`)
      client.connect(connectConfig)
    })
  }

  getConnection(sessionId: string): SSHConnection | undefined {
    return this.connections.get(sessionId)
  }

  setStream(sessionId: string, stream: ClientChannel): void {
    const conn = this.connections.get(sessionId)
    if (conn) {
      conn.stream = stream
    }
  }

  disconnect(sessionId: string): void {
    const conn = this.connections.get(sessionId)
    if (conn) {
      if (conn.stream) {
        conn.stream.close()
      }
      conn.client.end()
      this.connections.delete(sessionId)
      console.log(`SSH disconnected: [${sessionId}]`)
    }
  }

  createSFTP(sessionId: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const conn = this.connections.get(sessionId)
      if (!conn) {
        return reject(new Error('No SSH connection found for session'))
      }
      conn.client.sftp((err, sftp) => {
        if (err) {
          return reject(err)
        }
        resolve(sftp)
      })
    })
  }
}

export const sshService = new SSHService()
