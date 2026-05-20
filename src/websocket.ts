import https from 'https'
import WebSocket, { ClientOptions } from 'ws'
import { authenticate, AuthenticationOptions, type Credentials } from './authentication.js'
import { trim } from './trim.js'

/**
 * Indicates that the WebSocket handshake failed with ECONNREFUSED
 * after exhausting retries. Typically means the LCU process is starting
 * but the WebSocket server is not yet listening on the port.
 */
export class WsConnectionRefusedError extends Error {
  constructor(public readonly retries: number) {
    super(`Could not connect to LCU WebSocket API after ${retries} retries`)
    this.name = 'WsConnectionRefusedError'
  }
}

export interface EventResponse<T = any> {
  /**
   * The uri this event was dispatched at
   */
  uri: string
  /**
   * The data, if any
   */
  data: T
}

/**
 * Callback function for an subscription listener
 *
 * @param data The data payload (deserialized json)
 */
export type EventCallback<T = any> = (data: T | null, event: EventResponse<T>) => void

/**
 * WebSocket extension
 */
export class LeagueWebSocket extends WebSocket {
  subscriptions: Map<string, EventCallback[]> = new Map()
  readonly credentials: Credentials

  constructor(address: string, options: ClientOptions, credentials: Credentials) {
    super(address, options)
    this.credentials = credentials

    // Subscribe to Json API
    this.on('open', () => {
      this.send(JSON.stringify([5, 'OnJsonApiEvent']))
    })

    // Attach the LeagueWebSocket subscription hook
    this.on('message', (content: string) => {
      // Attempt to parse into JSON and dispatch events
      try {
        const json = JSON.parse(content)
        const [res]: [EventResponse] = json.slice(2)

        if (this.subscriptions.has(res.uri)) {
          this.subscriptions.get(res.uri)?.forEach((cb) => {
            cb(res.data, res)
          })
        }
      } catch {}
    })
  }

  public subscribe<T extends any = any>(path: string, effect: EventCallback<T>) {
    const p = `/${trim(path)}`

    if (!this.subscriptions.has(p)) {
      this.subscriptions.set(p, [effect])
    } else {
      this.subscriptions.get(p)?.push(effect)
    }
  }

  public unsubscribe(path: string) {
    const p = `/${trim(path)}`

    this.subscriptions.delete(p)
  }
}

export interface ConnectionOptions {
  /**
   * Options that will be used to authenticate to the LCU WebSocket API
   */
  authenticationOptions?: AuthenticationOptions

  /**
   * Polling interval in case connection fails.
   *
   * Default: 1000
   */
  pollInterval?: number

  /**
   * Maximum number of retries to connect to the LCU WebSocket API.
   * If set to -1, it will retry indefinitely.
   * If set to 0, it will not retry.
   * Default: 10
   */
  maxRetries?: number

  /**
   * Current retry count. Used internally, please do not modify.
   * @internal
   */
  __internalRetryCount?: number

  /**
   * Mock faulty connections. Used internally.
   * Value is the error message.
   * @internal
   */
  __internalMockFaultyConnection?: string

  /**
   * Callback function to be called when a mock faulty connection is made.
   * @internal
   * */
  __internalMockCallback?: () => void
}

/**
 * Creates a WebSocket connection to the League Client
 * @param {ConnectionOptions} [options] Options that will be used to authenticate to the League Client
 *
 * @throws WsConnectionRefusedError If the WebSocket handshake fails with ECONNREFUSED after exhausting retries
 * @throws WebSocket.ErrorEvent If the connection fails for any other reason
 *
 * Authentication step (see {@link authenticate}) may also throw:
 * @throws InvalidPlatformError On unsupported platforms
 * @throws ClientNotFoundError If the League Client process is not running and `awaitConnection` is false
 * @throws ClientElevatedPermsError If the League Client is running with elevated permissions
 * @throws ClientInstallNotFoundError If the League Client install directory cannot be located (lockfile path)
 * @throws ClientAuthTimeoutError If awaiting the client times out
 */
export async function createWebSocketConnection(options: ConnectionOptions = {}): Promise<LeagueWebSocket> {
  const credentials = await authenticate(options.authenticationOptions)
  const url = `wss://riot:${credentials.password}@127.0.0.1:${credentials.port}`

  return await new Promise((resolve, reject) => {
    const ws = new LeagueWebSocket(
      url,
      {
        headers: {
          Authorization: 'Basic ' + Buffer.from(`riot:${credentials.password}`).toString('base64')
        },
        agent: new https.Agent(
          typeof credentials?.certificate === 'undefined'
            ? {
                rejectUnauthorized: false
              }
            : {
                ca: credentials?.certificate
              }
        )
      },
      credentials
    )

    // Handle connection errors
    const errorHandler = (ws.onerror = (err) => {
      // Set options to default values if they are not set
      options.__internalRetryCount = options.__internalRetryCount ?? 0
      options.pollInterval = options.pollInterval ?? 1000
      options.maxRetries = options.maxRetries ?? 10

      // Check if this is a test and if so, call the mock callback
      if (options.__internalMockFaultyConnection && options.__internalMockCallback) {
        if (err.message.includes('EndTestOpen') && options.__internalRetryCount >= options.maxRetries) resolve(ws)
        options.__internalMockCallback?.()
      }

      // Detach listeners and close the socket regardless of why the error fired.
      // removeAllListeners() runs before close() so any deferred 'close' callbacks don't fire.
      ws.removeAllListeners()
      ws.close()

      // Check if the error is a connection refused error. This is thrown when the LCU is starting but not completely ready yet.
      if (err.message.includes('ECONNREFUSED')) {
        options.__internalRetryCount++

        // Check if the maximum number of retries has been reached and reject the promise if it has
        if (options.maxRetries === 0) {
          reject(new WsConnectionRefusedError(0))
        } else if (options.maxRetries > 0 && options.__internalRetryCount > options.maxRetries) {
          reject(new WsConnectionRefusedError(options.__internalRetryCount - 1))
        } else {
          // Wait for the poll interval and try again
          setTimeout(() => {
            resolve(createWebSocketConnection(options))
          }, options.pollInterval)
        }
      } else {
        reject(err)
      }
    })

    // Check if this is a test and if so, emit an error.
    // Requires waiting for the connection to be established since it's actually connecting to the LCU before emitting the error.
    if (options.__internalMockFaultyConnection) {
      ws.onopen = () => {
        ws.emit('error', new Error(`${options.__internalMockFaultyConnection}`))
        ws.removeListener('error', errorHandler)
      }
    } else {
      // Remove the error handler once the connection is established and resolve the promise
      ws.onopen = () => {
        ws.removeListener('error', errorHandler)
        resolve(ws)
      }
    }
  })
}
