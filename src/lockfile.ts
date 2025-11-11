import fs from 'fs'
import path from 'path'

export interface LockfileAuthInfo {
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
 * 1순위: 환경변수
 *  - LEAGUE_INSTALL_PATH="D:\Riot Games\League of Legends"
 */
function tryFromEnv(): LeagueInstallInfo | null {
  const envPath = process.env.LEAGUE_INSTALL_PATH
  if (!envPath) return null

  const root = path.resolve(envPath)
  const lockfile = path.join(root, 'lockfile')

  if (fileExists(lockfile)) {
    return { root, lockfile }
  }

  return null
}

/**
 * 2순위: Riot Metadata
 *  - %ProgramData%\Riot Games\Metadata\league_of_legends.*\*.product_settings.yaml
 *  - product_install_root / product_install_full_path 안에 설치 경로가 들어있음
 */
function tryFromMetadata(): LeagueInstallInfo | null {
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

    const rootMatch =
      yaml.match(/product_install_root:\s*"?(.+?)"?\s*$/m) || yaml.match(/product_install_full_path:\s*"?(.+?)"?\s*$/m)

    if (!rootMatch) continue

    let root = rootMatch[1].trim()

    // exe까지 포함돼 있으면 상위 폴더로
    if (root.toLowerCase().endsWith('.exe')) {
      root = path.dirname(root)
    }

    const lockfile = path.join(root, 'lockfile')
    if (fileExists(lockfile)) {
      return { root, lockfile }
    }
  }

  return null
}

/**
 * 3순위: RiotClientInstalls.json → Riot 루트 → League of Legends 폴더
 */
function tryFromRiotClientInstalls(): LeagueInstallInfo | null {
  const programData = getProgramDataDir()
  const installsPath = path.join(programData, 'Riot Games', 'RiotClientInstalls.json')

  if (!fileExists(installsPath)) return null

  try {
    const raw = fs.readFileSync(installsPath, 'utf8')
    const json = JSON.parse(raw) as Record<string, string>

    const anyPath = Object.values(json).find((p) => p.toLowerCase().includes('riotclientservices.exe'))
    if (!anyPath) return null

    const riotClientDir = path.dirname(anyPath)
    const riotRoot = path.resolve(riotClientDir, '..') // 예: C:\Riot Games

    const lolRoot = path.join(riotRoot, 'League of Legends')
    const lockfile = path.join(lolRoot, 'lockfile')

    if (fileExists(lockfile)) {
      return { root: lolRoot, lockfile }
    }
  } catch (e) {
    console.error('[league-connect] failed to parse RiotClientInstalls.json', e)
    return null
  }

  return null
}

/**
 * 4순위: 옛날 기본 설치 경로
 */
function tryDefaultPath(): LeagueInstallInfo | null {
  const root = 'C:\\Riot Games\\League of Legends'
  const lockfile = path.join(root, 'lockfile')

  if (fileExists(lockfile)) {
    return { root, lockfile }
  }

  return null
}

/**
 * 설치 루트 + lockfile 경로 찾기
 */
export function findLeagueInstall(): LeagueInstallInfo | null {
  const fromEnv = tryFromEnv()
  if (fromEnv) return fromEnv

  const fromMetadata = tryFromMetadata()
  if (fromMetadata) return fromMetadata

  const fromInstalls = tryFromRiotClientInstalls()
  if (fromInstalls) return fromInstalls

  const fromDefault = tryDefaultPath()
  if (fromDefault) return fromDefault

  return null
}

/**
 * lockfile 파싱 → port/password/protocol
 */
export function readLockfile(lockfilePath: string): LockfileAuthInfo | null {
  try {
    const raw = fs.readFileSync(lockfilePath, 'utf8').trim()
    const parts = raw.split(':')
    if (parts.length < 5) return null

    const portStr = parts[2]
    const password = parts[3]
    const protocol = parts[4] as 'http' | 'https'

    const port = Number(portStr)
    if (!port || !password || !protocol) return null

    return { port, password, protocol }
  } catch (e) {
    console.error('[league-connect] failed to read lockfile:', e)
    return null
  }
}

/**
 * 롤이 관리자 모드로 떠있을 때:
 *  - 프로세스 기준 authenticate는 막히니까
 *  - lockfile이 나올 때까지 poll 하면서 기다렸다가 auth 정보를 리턴
 */
export async function waitForLockfileAuth(pollIntervalMs = 2500): Promise<LockfileAuthInfo> {
  while (true) {
    const install = findLeagueInstall()
    if (install) {
      const auth = readLockfile(install.lockfile)
      if (auth) {
        return auth
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}
