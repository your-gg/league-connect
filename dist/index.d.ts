import { IncomingMessage } from 'http';
import WebSocket, { ClientOptions } from 'ws';

/**
 * install-dir 해석 캐시를 무효화합니다. 클라 종료/연결 해제 시 호출하면
 * 다음 연결에서 경로를 다시 해석합니다. (경로 자체는 보통 불변이라 호출은 선택적입니다.)
 */
declare function clearInstallDirCache(): void;
interface Credentials {
    /**
     * The system port the LCU API is running on
     */
    port: number;
    /**
     * The password for the LCU API
     */
    password: string;
    /**
     * The system process id for the LeagueClientUx process
     */
    pid: number;
    /**
     * Riot Games' self-signed root certificate (contents of .pem). If
     * it is `undefined` then unsafe authentication will be used.
     */
    certificate?: string;
}
interface AuthenticationOptions {
    /**
     * League Client process name. Set to RiotClientUx if you would like to
     * authenticate with the Riot Client
     *
     * Defaults: LeagueClientUx
     */
    name?: string;
    /**
     * Does not return before the League Client has been detected. This means the
     * function stays unresolved until a League has been found.
     *
     * Defaults: false
     */
    awaitConnection?: boolean;
    /**
     * The time duration in milliseconds between each attempt to locate a League
     * Client process. Has no effect if awaitConnection is false
     *
     * Default: 2500
     */
    pollInterval?: number;
    /**
     * Riot Games' self-signed root certificate (contents of .pem)
     *
     * Default: version of certificate bundled in package
     */
    certificate?: string;
    /**
     * Do not authenticate requests with Riot Games' self-signed root certificate
     *
     * Default: true if `certificate` is `undefined`
     */
    unsafe?: boolean;
    /**
     * Use deprecated Windows WMIC command line over Get-CimInstance. Does nothing
     * if the system is not running on Windows. This is used to keep backwards
     * compatability with Windows 7 systems that don't have Get-CimInstance
     *
     * See https://github.com/matsjla/league-connect/pull/54
     * See https://github.com/matsjla/league-connect/pull/68
     *
     * Default: false
     */
    useDeprecatedWmic?: boolean;
    /**
     * Set the Windows shell to use.
     *
     * Default: 'powershell'
     */
    windowsShell?: 'cmd' | 'powershell';
    /**
     * League of Legends installation path. Use this when the automatic discovery
     * fails (e.g. custom install location). Passed directly to findLeagueInstall.
     *
     * Example: 'D:\\Games\\League of Legends'
     */
    leagueInstallPath?: string;
}
/**
 * Indicates that the application does not run on an environment that the
 * League Client supports. The Client runs on windows, linux or darwin.
 */
declare class InvalidPlatformError extends Error {
    constructor();
}
/**
 * Indicates that the League Client could not be found
 */
declare class ClientNotFoundError extends Error {
    constructor();
}
/**
 * Indicates that the League Client is running as administrator and the current script is not
 */
declare class ClientElevatedPermsError extends Error {
    constructor();
}
/**
 * Indicates that the League Client installation path could not be found.
 * Pass `leagueInstallPath` in AuthenticationOptions to resolve this.
 */
declare class ClientInstallNotFoundError extends Error {
    constructor();
}
declare class ClientAuthTimeoutError extends Error {
    pid: number;
    processList: string[];
    constructor(pid: number, retries: number, processList: string[]);
}
/**
 * Locates a League Client and retrieves the credentials for the LCU API
 * from the found process
 *
 * Detection strategy (idle-resource optimized):
 *   1. Resolve the install directory (cached, fully file-based — no PowerShell).
 *   2. If resolved, check for the `lockfile`; absent ⇒ ClientNotFoundError ("not running").
 *   3. If present, read it (no PowerShell) and guard against a stale lockfile via the PID.
 *   4. Only when the install dir cannot be resolved (or the lockfile is unreadable, e.g.
 *      an elevated client) do we fall back to the legacy process-command-line scan.
 *
 * This means that, while the client is off, an installed League incurs ~0 process spawns.
 *
 * If options.awaitConnection is false the promise will resolve into a
 * rejection if a League Client is not running
 *
 * @param {AuthenticationOptions} [options] Authentication options, if any
 *
 * @throws InvalidPlatformError If the environment is not running
 * windows/linux/darwin
 * @throws ClientNotFoundError If the League Client could not be found
 * @throws ClientInstallNotFoundError If the install directory could not be located
 * @throws ClientElevatedPermsError If the League Client is running as administrator and the script is not (Windows only)
 */
declare function authenticate(options?: AuthenticationOptions): Promise<Credentials>;

declare type HeaderPair = [string, string];
declare type JsonObjectLike = Record<string, unknown>;
interface HttpResponse {
    readonly ok: boolean;
    /** Was the request redirected at some point? */
    readonly redirected: boolean;
    /** Http status code */
    readonly status: number;
    /** Get the raw text response. */
    text(): string;
    /** Attempt to parse the text response into json. Will throw if invalid json */
    json<T>(): string;
    /** Http response headers */
    headers(): HeaderPair[];
}
interface HttpRequestOptions<T = JsonObjectLike> {
    /**
     * Relative URL (relative to LCU API base url) to send api request to
     */
    url: string;
    /**
     * Http verb to use for request
     */
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /**
     * Optionally a body to pass to PUT/PATCH/POST/DELETE. This is typically
     * an object type as the library will parse this into JSON and send along
     * with the request
     */
    body?: T;
}

declare class Http1Response implements HttpResponse {
    private _message;
    private _raw;
    readonly ok: boolean;
    readonly redirected: boolean;
    readonly status: number;
    constructor(_message: IncomingMessage, _raw: Buffer);
    json<T = JsonObjectLike>(): T;
    text(): string;
    buffer(): Buffer;
    headers(): HeaderPair[];
}
declare function createHttp1Request<T>(options: HttpRequestOptions<T>, credentials: Credentials): Promise<Http1Response>;

/**
 * Indicates that the LCU WebSocket connection was refused (ECONNREFUSED) and
 * retries (if any) were exhausted. Typically means the client is starting up,
 * shutting down, or the lockfile is stale (port no longer listening).
 */
declare class WsConnectionRefusedError extends Error {
    constructor(message?: string);
}
interface EventResponse<T = any> {
    /**
     * The uri this event was dispatched at
     */
    uri: string;
    /**
     * The data, if any
     */
    data: T;
}
/**
 * Callback function for an subscription listener
 *
 * @param data The data payload (deserialized json)
 */
declare type EventCallback<T = any> = (data: T | null, event: EventResponse<T>) => void;
/**
 * WebSocket extension
 */
declare class LeagueWebSocket extends WebSocket {
    subscriptions: Map<string, EventCallback[]>;
    /**
     * The LCU credentials this socket was opened with. Set by
     * {@link createWebSocketConnection}. Useful for subsequent `createHttp1Request` calls.
     */
    credentials?: Credentials;
    constructor(address: string, options: ClientOptions);
    subscribe<T extends any = any>(path: string, effect: EventCallback<T>): void;
    unsubscribe(path: string): void;
}
interface ConnectionOptions {
    /**
     * Options that will be used to authenticate to the LCU WebSocket API
     */
    authenticationOptions?: AuthenticationOptions;
    /**
     * Polling interval in case connection fails.
     *
     * Default: 1000
     */
    pollInterval?: number;
    /**
     * Maximum number of retries to connect to the LCU WebSocket API.
     * If set to -1, it will retry indefinitely.
     * If set to 0, it will not retry.
     * Default: 10
     */
    maxRetries?: number;
}
/**
 * Creates a WebSocket connection to the League Client
 * @param {ConnectionOptions} [options] Options that will be used to authenticate to the League Client
 *
 * @throws Error If the connection fails due to ECONNREFUSED
 * @throws WebSocket.ErrorEvent If the connection fails for any other reason
 */
declare function createWebSocketConnection(options?: ConnectionOptions): Promise<LeagueWebSocket>;

export { AuthenticationOptions, ClientAuthTimeoutError, ClientElevatedPermsError, ClientInstallNotFoundError, ClientNotFoundError, ConnectionOptions, Credentials, EventCallback, EventResponse, HeaderPair, Http1Response, HttpRequestOptions, HttpResponse, InvalidPlatformError, JsonObjectLike, LeagueWebSocket, WsConnectionRefusedError, authenticate, clearInstallDirCache, createHttp1Request, createWebSocketConnection };
