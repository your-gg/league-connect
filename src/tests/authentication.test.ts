import fs from 'fs'
import os from 'os'
import path from 'path'
import { authenticate, ClientInstallNotFoundError, ClientNotFoundError } from '../authentication'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lc-auth-test-'))
}

function writeLockfile(dir: string, content: string): void {
  fs.writeFileSync(path.join(dir, 'lockfile'), content)
}

function cleanup(dirs: string[]) {
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {}
  }
}

const PLAINTEXT_CERT = `-----BEGIN CERTIFICATE-----
MIIEIDCCAwgCCQDJC+QAdVx4UDANBgkqhkiG9w0BAQUFADCB0TELMAkGA1UEBhMC
VVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFTATBgNVBAcTDFNhbnRhIE1vbmljYTET
MBEGA1UEChMKUmlvdCBHYW1lczEdMBsGA1UECxMUTG9MIEdhbWUgRW5naW5lZXJp
bmcxMzAxBgNVBAMTKkxvTCBHYW1lIEVuZ2luZWVyaW5nIENlcnRpZmljYXRlIEF1
dGhvcml0eTEtMCsGCSqGSIb3DQEJARYeZ2FtZXRlY2hub2xvZ2llc0ByaW90Z2Ft
ZXMuY29tMB4XDTEzMTIwNDAwNDgzOVoXDTQzMTEyNzAwNDgzOVowgdExCzAJBgNV
BAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRUwEwYDVQQHEwxTYW50YSBNb25p
Y2ExEzARBgNVBAoTClJpb3QgR2FtZXMxHTAbBgNVBAsTFExvTCBHYW1lIEVuZ2lu
ZWVyaW5nMTMwMQYDVQQDEypMb0wgR2FtZSBFbmdpbmVlcmluZyBDZXJ0aWZpY2F0
ZSBBdXRob3JpdHkxLTArBgkqhkiG9w0BCQEWHmdhbWV0ZWNobm9sb2dpZXNAcmlv
dGdhbWVzLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKoJemF/
6PNG3GRJGbjzImTdOo1OJRDI7noRwJgDqkaJFkwv0X8aPUGbZSUzUO23cQcCgpYj
21ygzKu5dtCN2EcQVVpNtyPuM2V4eEGr1woodzALtufL3Nlyh6g5jKKuDIfeUBHv
JNyQf2h3Uha16lnrXmz9o9wsX/jf+jUAljBJqsMeACOpXfuZy+YKUCxSPOZaYTLC
y+0GQfiT431pJHBQlrXAUwzOmaJPQ7M6mLfsnpHibSkxUfMfHROaYCZ/sbWKl3lr
ZA9DbwaKKfS1Iw0ucAeDudyuqb4JntGU/W0aboKA0c3YB02mxAM4oDnqseuKV/CX
8SQAiaXnYotuNXMCAwEAATANBgkqhkiG9w0BAQUFAAOCAQEAf3KPmddqEqqC8iLs
lcd0euC4F5+USp9YsrZ3WuOzHqVxTtX3hR1scdlDXNvrsebQZUqwGdZGMS16ln3k
WObw7BbhU89tDNCN7Lt/IjT4MGRYRE+TmRc5EeIXxHkQ78bQqbmAI3GsW+7kJsoO
q3DdeE+M+BUJrhWorsAQCgUyZO166SAtKXKLIcxa+ddC49NvMQPJyzm3V+2b1roP
SvD2WV8gRYUnGmy/N0+u6ANq5EsbhZ548zZc+BI4upsWChTLyxt2RxR7+uGlS1+5
EcGfKZ+g024k/J32XP4hdho7WYAS2xMiV83CfLR/MNi8oSMaVQTdKD8cpgiWJk3L
XWehWA==
-----END CERTIFICATE-----
`

// ---------------------------------------------------------------------------
// Unit tests — League 실행 불필요
// ---------------------------------------------------------------------------

describe('error classes', () => {
  describe('ClientInstallNotFoundError', () => {
    it('is an instance of Error', () => {
      const err = new ClientInstallNotFoundError()
      expect(err).toBeInstanceOf(Error)
    })

    it('has the correct message', () => {
      const err = new ClientInstallNotFoundError()
      expect(err.message).toBe('League Client installation path could not be located')
    })

    it('is distinguishable from ClientNotFoundError', () => {
      const installErr = new ClientInstallNotFoundError()
      const notFoundErr = new ClientNotFoundError()
      expect(installErr).toBeInstanceOf(ClientInstallNotFoundError)
      expect(installErr).not.toBeInstanceOf(ClientNotFoundError)
      expect(notFoundErr).not.toBeInstanceOf(ClientInstallNotFoundError)
    })
  })
})

// ---------------------------------------------------------------------------
// lockfile-first detection — League 실행 불필요, PowerShell spawn 미발생
// (leagueInstallPath를 임시 디렉토리로 지정해 파일 기반 경로만 태운다)
// ---------------------------------------------------------------------------

describe('authenticate (lockfile-first)', () => {
  let tmpDirs: string[] = []

  afterEach(() => {
    cleanup(tmpDirs)
    tmpDirs = []
  })

  it('throws ClientNotFoundError when install dir resolves but no lockfile (client off)', async () => {
    const dir = makeTempDir()
    tmpDirs.push(dir)
    // 실제 League 설치 폴더처럼 보이도록 마커를 둔다(없으면 잘못된 dir로 보고 process 스캔으로 위임).
    fs.writeFileSync(path.join(dir, 'LeagueClient.exe'), '')
    // lockfile 미작성 → 클라 미실행. 마커가 있으므로 spawn-free ClientNotFoundError.
    await expect(authenticate({ leagueInstallPath: dir })).rejects.toBeInstanceOf(ClientNotFoundError)
  })

  it('returns credentials from a valid lockfile with a live PID', async () => {
    const dir = makeTempDir()
    tmpDirs.push(dir)
    // 살아 있는 PID(현재 테스트 프로세스)를 사용 → staleness 가드 통과
    writeLockfile(dir, `LeagueClient:${process.pid}:54321:testpassword:https`)

    const credentials = await authenticate({ leagueInstallPath: dir })
    expect(credentials.port).toBe(54321)
    expect(credentials.password).toBe('testpassword')
    expect(credentials.pid).toBe(process.pid)
    expect(credentials.certificate).toBeDefined()
  })

  it('certificate is undefined with unsafe: true', async () => {
    const dir = makeTempDir()
    tmpDirs.push(dir)
    writeLockfile(dir, `LeagueClient:${process.pid}:54321:testpassword:https`)

    const credentials = await authenticate({ leagueInstallPath: dir, unsafe: true })
    expect(credentials.certificate).toBeUndefined()
  })

  it('throws ClientNotFoundError for a stale lockfile (dead PID)', async () => {
    const dir = makeTempDir()
    tmpDirs.push(dir)
    // 실재하지 않는 PID → stale lockfile로 판정
    writeLockfile(dir, `LeagueClient:2147483646:54321:testpassword:https`)

    await expect(authenticate({ leagueInstallPath: dir })).rejects.toBeInstanceOf(ClientNotFoundError)
  })
})

// ---------------------------------------------------------------------------
// Integration tests — League 실행 필요 (CI 환경에서 자동 skip)
// ---------------------------------------------------------------------------

const describeIfNotCI = process.env.CI ? describe.skip : describe

describeIfNotCI('authenticate (requires running League)', () => {
  test('returns credentials with default options', async () => {
    const credentials = await authenticate()

    expect(credentials).toBeDefined()
    expect(credentials.port).toBeGreaterThan(0)
    expect(credentials.password).toBeTruthy()
    expect(credentials.certificate).toBeDefined()
  })

  test('returns credentials with plaintext cert option', async () => {
    const credentials = await authenticate({ certificate: PLAINTEXT_CERT })

    expect(credentials).toBeDefined()
    expect(credentials.certificate).toBe(PLAINTEXT_CERT)
  })

  test('certificate is undefined when unsafe: true', async () => {
    const credentials = await authenticate({ unsafe: true })

    expect(credentials.certificate).toBeUndefined()
  })

  test('awaitConnection: true resolves when League starts', async () => {
    const credentials = await authenticate({
      awaitConnection: true,
      pollInterval: 2500,
    })

    expect(credentials).toBeDefined()
    expect(credentials.port).toBeGreaterThan(0)
  }, 300_000)
})
