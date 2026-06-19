export {
  authenticate,
  clearInstallDirCache,
  type AuthenticationOptions,
  type Credentials,
  ClientNotFoundError,
  ClientElevatedPermsError,
  ClientInstallNotFoundError,
  InvalidPlatformError,
  ClientAuthTimeoutError
} from './authentication.js'
export { createHttp1Request, Http1Response } from './http.js'
export {
  createWebSocketConnection,
  ConnectionOptions,
  LeagueWebSocket,
  WsConnectionRefusedError,
  EventResponse,
  EventCallback
} from './websocket.js'
export type { HttpRequestOptions, HttpResponse, JsonObjectLike, HeaderPair } from './request_types.js'
