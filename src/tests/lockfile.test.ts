import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lc-test-'))
}

function writeLockfile(dir: string, content = 'LeagueClient:12345:54321:testpassword:https'): string {
  const p = path.join(dir, 'lockfile')
  fs.writeFileSync(p, content)
  return p
}

function cleanup(dirs: string[]) {
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// readLockfile
// ---------------------------------------------------------------------------

describe('readLockfile', () => {
  let tmpDirs: string[] = []

  afterEach(() => {
    cleanup(tmpDirs)
    tmpDirs = []
  })

  it('parses valid lockfile content', async () => {
    const { readLockfile } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)
    const lf = writeLockfile(dir)

    const result = readLockfile(lf)
    expect(result).not.toBeNull()
    expect(result!.pid).toBe(12345)
    expect(result!.port).toBe(54321)
    expect(result!.password).toBe('testpassword')
    expect(result!.protocol).toBe('https')
  })

  it('returns null for malformed content (fewer than 5 parts)', async () => {
    const { readLockfile } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)
    const lf = path.join(dir, 'lockfile')
    fs.writeFileSync(lf, 'bad:content')

    expect(readLockfile(lf)).toBeNull()
  })

  it('returns null when file does not exist', async () => {
    const { readLockfile } = await import('../lockfile')
    expect(readLockfile('/nonexistent/path/lockfile')).toBeNull()
  })

  it('returns null when port is not a number', async () => {
    const { readLockfile } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)
    const lf = path.join(dir, 'lockfile')
    fs.writeFileSync(lf, 'LeagueClient:12345:NaN:password:https')

    expect(readLockfile(lf)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// findLeagueInstallDir
// ---------------------------------------------------------------------------

describe('findLeagueInstallDir', () => {
  let tmpDirs: string[] = []
  const origEnv = process.env.LEAGUE_INSTALL_PATH

  afterEach(() => {
    cleanup(tmpDirs)
    tmpDirs = []
    process.env.LEAGUE_INSTALL_PATH = origEnv
  })

  it('returns the provided installPath when directory exists', async () => {
    const { findLeagueInstallDir } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)

    const result = findLeagueInstallDir(dir)
    expect(result).toBe(path.resolve(dir))
  })

  it('does not adopt a provided installPath that does not exist (falls through to discovery)', async () => {
    const { findLeagueInstallDir } = await import('../lockfile')

    const bad = '/totally/nonexistent/path/12345'
    const result = findLeagueInstallDir(bad)
    // 존재하지 않는 명시 경로는 채택되지 않는다. 이후 auto-discovery로 폴백하며 그 결과는
    // 머신 환경(실제 설치 여부)에 따라 달라지므로 '그 잘못된 경로가 반환되지 않음'만 단정한다.
    expect(result).not.toBe(path.resolve(bad))
  })

  it('uses LEAGUE_INSTALL_PATH env var as fallback', async () => {
    const { findLeagueInstallDir } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)
    process.env.LEAGUE_INSTALL_PATH = dir

    const result = findLeagueInstallDir()
    expect(result).toBe(path.resolve(dir))
  })

  it('installPath takes priority over env var', async () => {
    const { findLeagueInstallDir } = await import('../lockfile')
    const dirA = makeTempDir()
    const dirB = makeTempDir()
    tmpDirs.push(dirA, dirB)
    process.env.LEAGUE_INSTALL_PATH = dirB

    const result = findLeagueInstallDir(dirA)
    expect(result).toBe(path.resolve(dirA))
  })

  it('does NOT require lockfile to exist — returns dir even without lockfile', async () => {
    const { findLeagueInstallDir } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)
    // no lockfile written

    const result = findLeagueInstallDir(dir)
    expect(result).not.toBeNull()
  })

  it('prefers product_install_full_path over product_install_root in Riot metadata', async () => {
    const { findLeagueInstallDir } = await import('../lockfile')
    // 실제 League 설치 폴더(full_path)와 그 상위(root)를 모두 존재시키고,
    // 메타데이터 yaml이 두 값을 다 담고 있을 때 full_path가 선택돼야 한다.
    const fullPathDir = makeTempDir() // .../League of Legends 역할
    const rootDir = path.dirname(fullPathDir) // .../Riot Games 역할 (상위, lockfile 없음)
    tmpDirs.push(fullPathDir)

    const programData = makeTempDir()
    tmpDirs.push(programData)
    const metaDir = path.join(programData, 'Riot Games', 'Metadata', 'league_of_legends.live')
    fs.mkdirSync(metaDir, { recursive: true })
    fs.writeFileSync(
      path.join(metaDir, 'league_of_legends.live.product_settings.yaml'),
      `product_install_full_path: "${fullPathDir.replace(/\\/g, '/')}"\n` +
        `product_install_root: "${rootDir.replace(/\\/g, '/')}"\n`
    )

    const origPD = process.env.PROGRAMDATA
    delete process.env.LEAGUE_INSTALL_PATH // 메타데이터 tier가 쓰이도록 env tier 비활성화
    process.env.PROGRAMDATA = programData
    try {
      const result = findLeagueInstallDir() // installPath 없이 auto-discovery
      expect(result).not.toBeNull()
      expect(path.resolve(result!)).toBe(path.resolve(fullPathDir)) // root(상위)가 아니라 full_path
    } finally {
      process.env.PROGRAMDATA = origPD
    }
  })
})

// ---------------------------------------------------------------------------
// findLeagueInstall
// ---------------------------------------------------------------------------

describe('findLeagueInstall', () => {
  let tmpDirs: string[] = []
  const origEnv = process.env.LEAGUE_INSTALL_PATH

  afterEach(() => {
    cleanup(tmpDirs)
    tmpDirs = []
    process.env.LEAGUE_INSTALL_PATH = origEnv
  })

  it('returns null when directory exists but lockfile is absent (League booting)', async () => {
    const { findLeagueInstall } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)
    // lockfile not yet written

    const result = findLeagueInstall(dir)
    expect(result).toBeNull()
  })

  it('returns LeagueInstallInfo when directory and lockfile both exist', async () => {
    const { findLeagueInstall } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)
    writeLockfile(dir)

    const result = findLeagueInstall(dir)
    expect(result).not.toBeNull()
    expect(result!.root).toBe(path.resolve(dir))
    expect(result!.lockfile).toBe(path.join(path.resolve(dir), 'lockfile'))
  })

  it('does not derive a result from a non-existent installPath (falls through to discovery)', async () => {
    const { findLeagueInstall } = await import('../lockfile')

    const bad = '/nonexistent/path/99999'
    const result = findLeagueInstall(bad)
    // 존재하지 않는 경로 자체로는 결과를 만들지 않는다(폴백 결과는 환경 의존).
    expect(result?.root).not.toBe(path.resolve(bad))
  })

  it('uses env var when no installPath provided and lockfile exists', async () => {
    const { findLeagueInstall } = await import('../lockfile')
    const dir = makeTempDir()
    tmpDirs.push(dir)
    writeLockfile(dir)
    process.env.LEAGUE_INSTALL_PATH = dir

    const result = findLeagueInstall()
    expect(result).not.toBeNull()
    expect(result!.root).toBe(path.resolve(dir))
  })
})
