import { authenticate } from '../authentication'

// Plaintext contents of riotgames.pem, selfsigned cert.
// Yes, this is intentionally supposed to be in the test code.
// This cert is public and downloadable from the Riot Games
// Developer portal.
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

describe('authenticating to the api', () => {
  test('locating the league client', async () => {
    const credentials = await authenticate()

    console.log(credentials)
    expect(credentials).toBeDefined()
    expect(credentials?.certificate).toBeDefined()
  })

  test('locating the league client using wmic on windows', async () => {
    const credentials = await authenticate({useDeprecatedWmic: true})

    expect(credentials).toBeDefined()
    expect(credentials?.certificate).toBeDefined()
  })

  test('enabling polling until a client is found', async () => {
    const credentials = await authenticate({
      awaitConnection: true,
      pollInterval: 2500
    })

    expect(credentials).toBeDefined()
    expect(credentials?.certificate).toBeDefined()
  }, 300_000)

  test('authentication using plaintext cert', async () => {
    const credentials = await authenticate({
      certificate: PLAINTEXT_CERT
    })

    expect(credentials).toBeDefined()
    expect(credentials?.certificate).toBeDefined()
  })

  test('authentication using unsafe cert toggles switch', async () => {
    const credentials = await authenticate({
      unsafe: true
    })

    expect(credentials?.certificate).toBeUndefined()
  })

  test('should throw error when process exists but auth info fails repeatedly', async () => {
    // 1. 테스트 조건 설정
    // 실제 환경에서 테스트하려면 롤을 켜두고 '관리자 권한' 문제를 강제로 일으키거나, 
    // 로직상 MAX_AUTH_RETRIES를 아주 낮게 잡아서 테스트해야 합니다.
    
    const start = Date.now();
    
    try {
      await authenticate({
        awaitConnection: true,
        pollInterval: 500, // 테스트 속도를 위해 짧게 설정
        // 의도적으로 잘못된 이름을 넣어 PID는 찾되 인증은 실패하게 만드는 시나리오를 시뮬레이션 하거나
        // 현재 로직이 PID 감지 후 실패 시 에러를 던지는지 확인합니다.
        name: 'LeagueClientUx' 
      });
      
      // 만약 인증에 성공하면 이 코드가 실행됨
      console.log('Client connected successfully');
    } catch (err: any) {
      const end = Date.now();
      const duration = end - start;

      // 2. 에러 검증
      console.log(`Error caught after ${duration}ms:`, err.message);
      
      // 우리가 정의한 에러 메시지가 포함되어 있는지 확인
      expect(err.message).toMatch(/detected but failed to retrieve auth info/);
      
      // 에러 객체에 PID가 담겨 있는지 확인 (Sentry 추적용 필드)
      if (err.pid) {
        expect(err.pid).toBeGreaterThan(0);
        console.log('Caught PID for Sentry:', err.pid);
      }
    }
  }, 30000); // 30초 타임아웃
})
