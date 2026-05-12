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

  it('returns null when provided installPath does not exist', async () => {
    const { findLeagueInstallDir } = await import('../lockfile')

    const result = findLeagueInstallDir('/totally/nonexistent/path/12345')
    expect(result).toBeNull()
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

  it('returns null when installPath does not exist at all', async () => {
    const { findLeagueInstall } = await import('../lockfile')

    const result = findLeagueInstall('/nonexistent/path/99999')
    expect(result).toBeNull()
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
