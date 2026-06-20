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

class SSHService {
  private connections: Map<string, SSHConnection> = new Map()

  createConnection(sessionId: string, config: SSHConfig): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client()

      const connectConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username: config.username,
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else {
        connectConfig.privateKey = config.privateKey
        if (config.passphrase) {
          connectConfig.passphrase = config.passphrase
        }
      }

      client.on('ready', () => {
        this.connections.set(sessionId, { client, stream: null })
        resolve(client)
      })

      client.on('error', (err) => {
        reject(err)
      })

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
