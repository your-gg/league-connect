import fs from 'fs'
import path from 'path'

export interface LockfileAuthInfo {
  /**
   * lockfile에 기록된 프로세스 ID. stale lockfile 판별(생존확인)에 사용됩니다.
   * 파싱 불가 시 NaN일 수 있으므로 사용 전 `> 0` 가드를 두세요.
   */
  pid: number
  port: number
  password: string
  protocol: 'http' | 'https'
}

export interface LeagueInstallInfo {
  root: string
  lockfile: string
}

function getProgramDataDir(): string {
  return process.env.PROGRAMDATA || 'C:\\ProgramData'
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

/**
 * 1순위: 수동 지정 경로
 */
function tryRootFromPath(installPath: string): string | null {
  const root = path.resolve(installPath)
  return fileExists(root) ? root : null
}

/**
 * 2순위: 환경변수
 *  - LEAGUE_INSTALL_PATH="D:\Riot Games\League of Legends"
 */
function tryRootFromEnv(): string | null {
  const envPath = process.env.LEAGUE_INSTALL_PATH
  if (!envPath) return null
  const root = path.resolve(envPath)
  return fileExists(root) ? root : null
}

/**
 * 3순위: Riot Metadata
 *  - %ProgramData%\Riot Games\Metadata\league_of_legends.*\*.product_settings.yaml
 *  - product_install_root / product_install_full_path 안에 설치 경로가 들어있음
 */
function tryRootFromMetadata(): string | null {
  const programData = getProgramDataDir()
  const metadataRoot = path.join(programData, 'Riot Games', 'Metadata')

  if (!fileExists(metadataRoot)) return null

  const entries = fs.readdirSync(metadataRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.toLowerCase().includes('league_of_legends')) continue

    const dirPath = path.join(metadataRoot, entry.name)
    const files = fs.readdirSync(dirPath)

    const settingsFile = files.find((f) => f.endsWith('.product_settings.yaml'))
    if (!settingsFile) continue

    const fullPath = path.join(dirPath, settingsFile)
    const yaml = fs.readFileSync(fullPath, 'utf8')

    // product_install_full_path는 실제 League 설치 폴더(...\League of Legends),
    // product_install_root는 그 상위(...\Riot Games)다. lockfile은 설치 폴더에 있으므로
    // full_path를 우선한다. (root를 먼저 잡으면 상위 폴더가 반환돼 lockfile을 못 찾는다)
    const rootMatch =
      yaml.match(/product_install_full_path:\s*"?(.+?)"?\s*$/m) || yaml.match(/product_install_root:\s*"?(.+?)"?\s*$/m)

    if (!rootMatch) continue

    let root = rootMatch[1].trim()

    // exe까지 포함돼 있으면 상위 폴더로
    if (root.toLowerCase().endsWith('.exe')) {
      root = path.dirname(root)
    }

    if (fileExists(root)) return root
  }

  return null
}

/**
 * 4순위: RiotClientInstalls.json → associated_client 키 → sibling 휴리스틱
 */
function tryRootFromRiotClientInstalls(): string | null {
  const programData = getProgramDataDir()
  const installsPath = path.join(programData, 'Riot Games', 'RiotClientInstalls.json')

  if (!fileExists(installsPath)) return null

  try {
    const raw = fs.readFileSync(installsPath, 'utf8')
    const json = JSON.parse(raw)

    // Preferred path: associated_client keys are the actual League install paths.
    // Riot's installer writes these whenever League is installed at a non-default location.
    if (json.associated_client && typeof json.associated_client === 'object') {
      for (const lolPath of Object.keys(json.associated_client)) {
        const lolRoot = path.normalize(lolPath)
        if (fileExists(lolRoot)) return lolRoot
      }
    }

    // Fallback: original sibling-folder heuristic (works for default installs where League is
    // a sibling of Riot Client). Kept for back-compat in case associated_client is missing.
    const values = Object.values(json).filter((p): p is string => typeof p === 'string')
    const anyPath = values.find((p) => p.toLowerCase().includes('riotclientservices.exe'))
    if (!anyPath) return null

    const riotClientDir = path.dirname(anyPath)
    const riotRoot = path.resolve(riotClientDir, '..') // 예: C:\Riot Games
    const lolRoot = path.join(riotRoot, 'League of Legends')

    if (fileExists(lolRoot)) return lolRoot
  } catch (e) {
    console.error('[league-connect] failed to parse RiotClientInstalls.json', e)
    return null
  }

  return null
}

/**
 * 5순위: 옛날 기본 설치 경로
 */
function tryDefaultRoot(): string | null {
  const root = 'C:\\Riot Games\\League of Legends'
  return fileExists(root) ? root : null
}

/**
 * 설치 디렉토리 탐색 (lockfile 존재 여부는 확인하지 않음)
 *
 * @param installPath 수동 지정 경로 (최우선 적용)
 */
export function findLeagueInstallDir(installPath?: string): string | null {
  if (installPath) {
    const root = tryRootFromPath(installPath)
    if (root) return root
  }

  return (
    tryRootFromEnv() ??
    tryRootFromMetadata() ??
    tryRootFromRiotClientInstalls() ??
    tryDefaultRoot()
  )
}

/**
 * 설치 루트 + lockfile 경로 찾기 (lockfile 존재까지 확인)
 *
 * @param installPath 수동 지정 경로 (최우선 적용)
 */
export function findLeagueInstall(installPath?: string): LeagueInstallInfo | null {
  const root = findLeagueInstallDir(installPath)
  if (!root) return null

  const lockfile = path.join(root, 'lockfile')
  if (!fileExists(lockfile)) return null

  return { root, lockfile }
}

/**
 * lockfile 파싱 → port/password/protocol
 */
export function readLockfile(lockfilePath: string): LockfileAuthInfo | null {
  try {
    const raw = fs.readFileSync(lockfilePath, 'utf8').trim()
    const parts = raw.split(':')
    if (parts.length < 5) return null

    const pidStr = parts[1]
    const portStr = parts[2]
    const password = parts[3]
    const protocol = parts[4] as 'http' | 'https'

    const port = Number(portStr)
    if (!port || !password || !protocol) return null

    // pid는 best-effort(staleness 판별용). 파싱 실패해도 lockfile 자체는 유효로 본다.
    const pid = Number(pidStr)

    return { pid, port, password, protocol }
  } catch (e) {
    console.error('[league-connect] failed to read lockfile:', e)
    return null
  }
}
