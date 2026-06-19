import cp from 'child_process'
import util from 'util'
import fs from 'fs'
import path from 'path'
import { getProcessId, getAllProcessNames, isPidAlive } from './process'
import { RIOT_GAMES_CERT } from './cert.js'
import { findLeagueInstallDir, readLockfile } from './lockfile.js'

const exec = util.promisify<typeof cp.exec.__promisify__>(cp.exec)

const DEFAULT_NAME = 'LeagueClientUx'
const DEFAULT_POLL_INTERVAL = 2500

// ---------------------------------------------------------------------------
// install-dir 해석 캐시 (전부 파일 기반 — PowerShell spawn 없음)
//
// findLeagueInstallDir는 매 호출마다 PROGRAMDATA metadata / RiotClientInstalls.json을
// 다시 훑으므로, 상시 폴링하는 소비 앱을 위해 해석 '결과'만 캐시한다.
// lockfile '내용'(port/password)은 클라 재시작마다 바뀌므로 절대 캐시하지 않고 매번 fresh read.
// ---------------------------------------------------------------------------
let cachedInstallDir: string | null = null

function resolveInstallDir(installPath?: string): string | null {
  // 명시 경로는 결정적이므로 캐시를 우회한다.
  if (installPath) return findLeagueInstallDir(installPath)
  // 캐시된 경로가 여전히 디스크에 존재할 때만 재사용(언인스톨/이동 자가 치유).
  if (cachedInstallDir && fs.existsSync(cachedInstallDir)) return cachedInstallDir
  cachedInstallDir = findLeagueInstallDir()
  return cachedInstallDir
}

/**
 * install-dir 해석 캐시를 무효화합니다. 클라 종료/연결 해제 시 호출하면
 * 다음 연결에서 경로를 다시 해석합니다. (경로 자체는 보통 불변이라 호출은 선택적입니다.)
 */
export function clearInstallDirCache(): void {
  cachedInstallDir = null
}

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
   * League of Legends installation path. Use this when the automatic discovery
   * fails (e.g. custom install location). Passed directly to findLeagueInstall.
   *
   * Example: 'D:\\Games\\League of Legends'
   */
  leagueInstallPath?: string
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

/**
 * Indicates that the League Client installation path could not be found.
 * Pass `leagueInstallPath` in AuthenticationOptions to resolve this.
 */
export class ClientInstallNotFoundError extends Error {
  constructor() {
    super('League Client installation path could not be located')
  }
}

export class ClientAuthTimeoutError extends Error {
  public pid: number
  public processList: string[]

  constructor(pid: number, retries: number, processList: string[]) {
    super(`LeagueClient (PID: ${pid}) detected but failed to retrieve auth info after ${retries} attempts.`)
    this.name = 'ClientAuthTimeoutError'
    this.pid = pid
    this.processList = processList
  }
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
export async function authenticate(options?: AuthenticationOptions): Promise<Credentials> {
  const portRegex = /--app-port=([0-9]+)(?= *"| --)/
  const passwordRegex = /--remoting-auth-token=(.+?)(?= *"| --)/
  const pidRegex = /--app-pid=([0-9]+)(?= *"| --)/

  const name = options?.name ?? DEFAULT_NAME
  const isWindows = process.platform === 'win32'
  const executionOptions = isWindows ? { shell: options?.windowsShell ?? ('powershell' as string) } : {}
  let retryCount = 0 // 예기치 못한 인증 실패 연속 횟수
  const MAX_AUTH_RETRIES = 5

  if (!['win32', 'linux', 'darwin'].includes(process.platform)) {
    throw new InvalidPlatformError()
  }

  function selectCertificate(): string | undefined {
    const unsafe = options?.unsafe === true
    const hasCert = options?.certificate !== undefined
    // See flow chart for this here: https://github.com/matsjla/league-connect/pull/44#issuecomment-790384881
    // 사용자가 지정한 인증서 → unsafe면 undefined → 기본값은 번들 인증서
    return hasCert ? options!.certificate : unsafe ? undefined : RIOT_GAMES_CERT
  }

  /**
   * 1차: lockfile 우선 경로 (PowerShell 미경유). 기본 League 클라이언트에만 적용.
   *
   * @returns Credentials 성공 시 / null 이면 "process 스캔으로 fallback" 신호.
   * @throws ClientNotFoundError 설치 경로는 있으나 클라 미실행(lockfile 없음) 또는 stale lockfile.
   */
  function tryLockfileFirst(): Credentials | null {
    // RiotClientUx 등 커스텀 name은 League install lockfile과 무관하므로 process 스캔으로.
    if (name !== DEFAULT_NAME) return null

    const installDir = resolveInstallDir(options?.leagueInstallPath)
    if (!installDir) return null // 설치 경로 미상 → process 스캔 fallback (희귀)

    const lockfilePath = path.join(installDir, 'lockfile')
    if (!fs.existsSync(lockfilePath)) {
      // lockfile이 없다. 해석된 경로가 실제 League 설치 폴더가 맞는지 마커로 확인한다.
      // 마커(LeagueClient.exe)가 있으면 진짜 "클라 미실행" → spawn-free ClientNotFoundError.
      // 마커가 없으면 경로 해석이 빗나간 것(상위 폴더 등) → process 스캔으로 위임해
      // 실행 중인 클라를 커맨드라인으로 찾게 한다(잘못된 dir로 인한 거짓 미실행 방지).
      if (isWindows && !fs.existsSync(path.join(installDir, 'LeagueClient.exe'))) {
        return null
      }
      throw new ClientNotFoundError()
    }

    const auth = readLockfile(lockfilePath)
    if (!auth) return null // 존재하나 읽기 실패(ACL/권한상승) 또는 malformed → process 스캔 fallback

    // PID가 유효하지 않으면(손상/부분 기록된 lockfile 등) 생존을 증명할 수 없으므로
    // 미검증 자격증명을 반환하지 말고 process 스캔으로 위임한다. (NaN/0가 `> 0` 단락으로
    // staleness 가드를 통째로 건너뛰던 문제 방지)
    if (!Number.isInteger(auth.pid) || auth.pid <= 0) {
      return null
    }

    // stale lockfile(크래시 잔존) 방어: lockfile PID가 죽었으면 미실행 취급.
    // (PID 재활용 등 잔여 케이스는 연결단 ECONNREFUSED가 최종 판정.)
    if (!isPidAlive(auth.pid)) {
      throw new ClientNotFoundError()
    }

    return {
      port: auth.port,
      pid: auth.pid,
      password: auth.password,
      certificate: selectCertificate()
    }
  }

  /**
   * 2차(fallback): 기존 process-command-line 스캔 (Windows에서 PowerShell).
   * 설치 경로를 못 찾았거나 lockfile을 못 읽은 경우에만 도달한다.
   */
  async function tryProcessCmdlineScan(): Promise<Credentials> {
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
      // Remove newlines from stdout
      const stdout = rawStdout.replace(/\n|\r/g, '')

      const portMatch = stdout.match(portRegex)
      const passwordMatch = stdout.match(passwordRegex)
      const pidMatch = stdout.match(pidRegex)

      // 매칭 실패(프로세스 없음/커맨드라인 못 읽음) → 명시적으로 not-found 처리.
      // 이전엔 null 구조분해 TypeError를 catch로 흘려보냈으나, 이제는 의도를 분명히 한다.
      if (!portMatch || !passwordMatch || !pidMatch) {
        throw new ClientNotFoundError()
      }

      return {
        port: Number(portMatch[1]),
        pid: Number(pidMatch[1]),
        password: passwordMatch[1],
        certificate: selectCertificate()
      }
    } catch (err) {
      if (options?.__internalDebug) console.error(err)

      // 관리자 권한으로 클라가 실행 중이라 커맨드라인을 못 읽는 경우를 점검 (PowerShell 3.0+)
      // 이 probe exec 자체가 실패(PowerShell 부재/ENOENT/비정상 종료)해도 도메인 에러만
      // escape하도록 try/catch로 감싼다. (실패 시 elevated 아님으로 간주)
      let isElevated = false
      if (isWindows && (options?.windowsShell ?? 'powershell') === 'powershell') {
        try {
          const { stdout: adminCheck } = await exec(
            `if ((Get-Process -Name ${name} -ErrorAction SilentlyContinue | Where-Object {!$_.Handle -and !$_.Path})) {Write-Output "True"} else {Write-Output "False"}`,
            { shell: 'powershell' }
          )
          isElevated = adminCheck.includes('True')
        } catch {
          isElevated = false
        }
      }

      const realPid = await getProcessId(name)

      if (isElevated || realPid !== -1) {
        // 1) lockfile로 자격증명 시도 (관리자 클라여도 lockfile이 읽히면 성공)
        const installDir = findLeagueInstallDir(options?.leagueInstallPath)
        if (installDir) {
          const lockfilePath = path.join(installDir, 'lockfile')
          if (fs.existsSync(lockfilePath)) {
            const auth = readLockfile(lockfilePath)
            if (auth) {
              return { port: auth.port, pid: realPid, password: auth.password, certificate: selectCertificate() }
            }
          }
        }

        // 2) 프로세스는 있으나 cmdline도 lockfile도 못 읽음. 관리자 권한 클라가 원인이면
        //    그 신호를 *우선* 내려준다 → 소비 앱이 폴더 피커가 아니라 "관리자로 실행"을 안내.
        //    (관리자로 재실행되면 cmdline이 읽혀 바로 연결된다.)
        if (isElevated) {
          throw new ClientElevatedPermsError()
        }

        // 3) 비권한 + 설치 경로 자체를 못 찾음 → 경로 지정 필요
        if (!installDir) {
          throw new ClientInstallNotFoundError()
        }

        // 4) 경로는 알지만 lockfile 없음/못읽음 + 비권한 → 미실행/부팅 중
        throw new ClientNotFoundError()
      }

      throw new ClientNotFoundError()
    }
  }

  async function tryAuthenticateInternal(): Promise<Credentials> {
    const fast = tryLockfileFirst() // creds 반환 / null(=fallback) / throw ClientNotFoundError
    if (fast) return fast
    return tryProcessCmdlineScan()
  }

  if (options?.awaitConnection) {
    return new Promise<Credentials>(function self(resolve, reject) {
      tryAuthenticateInternal()
        .then(resolve)
        .catch(async (err) => {
          // 설치 경로 미상 → 재시도해도 의미 없음 → 즉시 reject
          if (err instanceof ClientInstallNotFoundError) {
            reject(err)
            return
          }

          // 미실행/부팅중/권한상승 → 경로는 알지만 아직 준비 안 됨 → 카운터 리셋 후 재시도
          if (err instanceof ClientNotFoundError || err instanceof ClientElevatedPermsError) {
            retryCount = 0
            setTimeout(() => self(resolve, reject), options?.pollInterval ?? DEFAULT_POLL_INTERVAL)
            return
          }

          // 예기치 못한 에러 → 한정 재시도 후 timeout
          retryCount++
          if (retryCount >= MAX_AUTH_RETRIES) {
            const allProcesses = await getAllProcessNames()
            reject(new ClientAuthTimeoutError(-1, MAX_AUTH_RETRIES, allProcesses))
          } else {
            setTimeout(() => self(resolve, reject), options?.pollInterval ?? DEFAULT_POLL_INTERVAL)
          }
        })
    })
  }

  return tryAuthenticateInternal()
}
