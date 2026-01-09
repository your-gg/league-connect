import cp from 'child_process'
import util from 'util'
import { RIOT_GAMES_CERT } from './cert.js'
import { waitForLockfileAuth } from './lockfile.js'

const exec = util.promisify<typeof cp.exec.__promisify__>(cp.exec)

const DEFAULT_NAME = 'LeagueClientUx'
const DEFAULT_POLL_INTERVAL = 2500

export interface Credentials {
  /**
   * The system port the LCU API is running on
   */
  port: number
  /**
   * The password for the LCU API
   */
  password: string
  /**
   * The system process id for the LeagueClientUx process
   */
  pid: number
  /**
   * Riot Games' self-signed root certificate (contents of .pem). If
   * it is `undefined` then unsafe authentication will be used.
   */
  certificate?: string
}

export interface AuthenticationOptions {
  /**
   * League Client process name. Set to RiotClientUx if you would like to
   * authenticate with the Riot Client
   *
   * Defaults: LeagueClientUx
   */
  name?: string
  /**
   * Does not return before the League Client has been detected. This means the
   * function stays unresolved until a League has been found.
   *
   * Defaults: false
   */
  awaitConnection?: boolean
  /**
   * The time duration in milliseconds between each attempt to locate a League
   * Client process. Has no effect if awaitConnection is false
   *
   * Default: 2500
   */
  pollInterval?: number
  /**
   * Riot Games' self-signed root certificate (contents of .pem)
   *
   * Default: version of certificate bundled in package
   */
  certificate?: string
  /**
   * Do not authenticate requests with Riot Games' self-signed root certificate
   *
   * Default: true if `certificate` is `undefined`
   */
  unsafe?: boolean
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
  useDeprecatedWmic?: boolean
  /**
   * Set the Windows shell to use.
   *
   * Default: 'powershell'
   */
  windowsShell?: 'cmd' | 'powershell'
  /**
   * Debug mode. Prints error information to console.
   * @internal
   */
  __internalDebug?: boolean
}

/**
 * Indicates that the application does not run on an environment that the
 * League Client supports. The Client runs on windows, linux or darwin.
 */
export class InvalidPlatformError extends Error {
  constructor() {
    super('process runs on platform client does not support')
  }
}

/**
 * Indicates that the League Client could not be found
 */
export class ClientNotFoundError extends Error {
  constructor() {
    super('League Client process could not be located')
  }
}

/**
 * Indicates that the League Client is running as administrator and the current script is not
 */
export class ClientElevatedPermsError extends Error {
  constructor() {
    super('League Client has been detected but is running as administrator')
  }
}

async function authenticateFromLockfile(options?: AuthenticationOptions): Promise<Credentials> {
  const pollInterval = options?.pollInterval ?? DEFAULT_POLL_INTERVAL
  const auth = await waitForLockfileAuth(pollInterval)

  const unsafe = options?.unsafe === true
  const hasCert = options?.certificate !== undefined

  const certificate = hasCert ? options!.certificate : unsafe ? undefined : RIOT_GAMES_CERT

  return {
    port: auth.port,
    pid: -1,
    password: auth.password,
    certificate
  }
}

/**
 * Fetch process id
 */
async function getProcessId(name: string): Promise<number> {
  try {
    const command = `Get-CimInstance -Query "SELECT ProcessId from Win32_Process WHERE name LIKE '${name}.exe'" | Select-Object -ExpandProperty ProcessId`
    const { stdout } = await exec(command, { shell: 'powershell' })
    const pid = parseInt(stdout.trim(), 10)
    return isNaN(pid) ? -1 : pid
  } catch {
    return -1
  }
}

/**
 * Locates a League Client and retrieves the credentials for the LCU API
 * from the found process
 *
 * If options.awaitConnection is false the promise will resolve into a
 * rejection if a League Client is not running
 *
 * @param {AuthenticationOptions} [options] Authentication options, if any
 *
 * @throws InvalidPlatformError If the environment is not running
 * windows/linux/darwin
 * @throws ClientNotFoundError If the League Client could not be found
 * @throws ClientElevatedPermsError If the League Client is running as administrator and the script is not (Windows only)
 */
export async function authenticate(options?: AuthenticationOptions): Promise<Credentials> {
  const portRegex = /--app-port=([0-9]+)(?= *"| --)/
  const passwordRegex = /--remoting-auth-token=(.+?)(?= *"| --)/
  const pidRegex = /--app-pid=([0-9]+)(?= *"| --)/

  const name = options?.name ?? DEFAULT_NAME
  const isWindows = process.platform === 'win32'
  const executionOptions = isWindows ? { shell: options?.windowsShell ?? ('powershell' as string) } : {}
  let retryCountWithPid = 0; // PID는 있는데 인증에 실패한 횟수 카운트
  const MAX_AUTH_RETRIES = 5;

  if (!['win32', 'linux', 'darwin'].includes(process.platform)) {
    throw new InvalidPlatformError()
  }

  async function tryAuthenticateInternal() {
    try {
      let command: string
      if (!isWindows) {
        command = `ps x -o args | grep '${name}'`
      } else if (options?.useDeprecatedWmic === true) {
        command = `wmic process where "caption='${name}.exe'" get commandline`
      } else {
        command = `Get-CimInstance -Query "SELECT * from Win32_Process WHERE name LIKE '${name}.exe'" | Select-Object -ExpandProperty CommandLine`
      }

      const { stdout: rawStdout } = await exec(command, executionOptions)
      // TODO: investigate regression with calling .replace on rawStdout
      // Remove newlines from stdout
      const stdout = rawStdout.replace(/\n|\r/g, '')
      const [, port] = stdout.match(portRegex)!
      const [, password] = stdout.match(passwordRegex)!
      const [, pid] = stdout.match(pidRegex)!
      const unsafe = options?.unsafe === true
      const hasCert = options?.certificate !== undefined

      // See flow chart for this here: https://github.com/matsjla/league-connect/pull/44#issuecomment-790384881
      // If user specifies certificate, use it
      const certificate = hasCert
        ? options!.certificate
        : // Otherwise: does the user want unsafe requests?
        unsafe
        ? undefined
        : // Didn't specify, use our own certificate
          RIOT_GAMES_CERT

      return {
        port: Number(port),
        pid: Number(pid),
        password,
        certificate
      }
    } catch (err) {
      if (options?.__internalDebug) console.error(err)

      // Check if the user is running the client as an administrator leading to not being able to find the process
      // Requires PowerShell 3.0 or higher
      let isElevated = false
      if (isWindows && (options?.windowsShell ?? 'powershell') === 'powershell') {
        const { stdout: adminCheck } = await exec(
          `if ((Get-Process -Name ${name} -ErrorAction SilentlyContinue | Where-Object {!$_.Handle -and !$_.Path})) {Write-Output "True"} else {Write-Output "False"}`,
          { shell: 'powershell' }
        )
        isElevated = adminCheck.includes('True')
      }

      const realPid = await getProcessId(name)

      if (isElevated || realPid !== -1) {
        const credentials = await authenticateFromLockfile(options)
        credentials.pid = realPid
        return credentials
      }

      throw new ClientNotFoundError()
    }
  }

if (options?.awaitConnection) {
    return new Promise(function self(resolve, reject) {
      getProcessId(name).then(async (pid) => {
        if (pid === -1) {
          retryCountWithPid = 0;
          setTimeout(() => self(resolve, reject), options?.pollInterval ?? DEFAULT_POLL_INTERVAL);
          return;
        }

        try {
          const credentials = await tryAuthenticateInternal();
          resolve(credentials);
        } catch (err) {
          retryCountWithPid++;

          if (retryCountWithPid >= MAX_AUTH_RETRIES) {
            const error = new Error(`LeagueClient (PID: ${pid}) detected but failed to retrieve auth info after ${MAX_AUTH_RETRIES} attempts.`);
            reject(error); 
          } else {
            setTimeout(() => self(resolve, reject), options?.pollInterval ?? DEFAULT_POLL_INTERVAL);
          }
        }
      });
    });
  }

  return tryAuthenticateInternal()
}
