# @your-gg/league-connect

리그 오브 레전드 클라이언트(LCU) API를 사용하기 위한 Node.js 모듈.

[matsjla/league-connect](https://github.com/matsjla/league-connect) 포크 버전으로, 인증 안정성 개선, 에러 핸들링 강화, GitHub Packages 배포를 포함한다.

## 릴리즈

```sh
# master 브랜치에서 모든 커밋 완료 후 실행
npm run release -- v1.0.2        # 정식 릴리즈 (latest)
npm run release -- v1.0.2-beta.1 # 사전 릴리즈 (beta)
```

semver 검증, origin 동기화 확인, 태그 생성 및 push까지 처리한다. CI가 테스트 → 빌드 → publish를 실행한다.

> beta 버전 설치: `npm install @your-gg/league-connect@beta`. latest에는 영향 없음.

## 설치

이 패키지는 **GitHub Packages**에 배포된다. 프로젝트의 `.npmrc`에 다음을 추가한다:

```ini
@your-gg:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_TOKEN}
always-auth=true
```

설치:

```sh
npm install @your-gg/league-connect
# 또는
yarn add @your-gg/league-connect
```

> `GH_TOKEN`은 `read:packages` 권한이 필요하다. CI에서는 `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`을 사용한다.

## 사용법

### authenticate

실행 중인 League 클라이언트를 찾아 LCU API 인증 정보를 반환한다.

```ts
import { authenticate } from '@your-gg/league-connect'

const credentials = await authenticate()
// { port: 54321, password: 'abc123', pid: 12345, certificate: '...' }
```

**옵션**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `awaitConnection` | `false` | League가 발견될 때까지 폴링 |
| `pollInterval` | `2500` | 폴링 간격 (ms), `awaitConnection: true` 필요 |
| `leagueInstallPath` | `undefined` | 수동 설치 경로 — 자동 탐색 실패 시 사용 |
| `certificate` | Riot 인증서 | LCU HTTPS용 커스텀 PEM 인증서 |
| `unsafe` | `false` | 인증서 검증 생략 |
| `name` | `LeagueClientUx` | 프로세스 이름 (Riot Client는 `RiotClientUx`) |
| `windowsShell` | `powershell` | Windows 셸 (`powershell` 또는 `cmd`) |
| `useDeprecatedWmic` | `false` | CIM 대신 WMIC 사용 (Windows 7 전용) |

```ts
const credentials = await authenticate({
  awaitConnection: true,
  pollInterval: 2500,
})
```

#### 에러 처리

| 에러 | 발생 조건 |
|------|-----------|
| `ClientNotFoundError` | League 미실행 또는 설치 경로 아직 없음 |
| `ClientInstallNotFoundError` | League 실행 중이나 설치 디렉토리를 찾을 수 없음 — 사용자에게 경로 요청 |
| `ClientElevatedPermsError` | League가 관리자 권한으로 실행 중 |
| `ClientAuthTimeoutError` | 프로세스는 발견됐으나 인증 정보 반복 획득 실패 |
| `InvalidPlatformError` | Windows / macOS / Linux 이외 환경 |

**수동 설치 경로 예시**

```ts
import { authenticate, ClientInstallNotFoundError } from '@your-gg/league-connect'

try {
  const credentials = await authenticate({ awaitConnection: true })
} catch (err) {
  if (err instanceof ClientInstallNotFoundError) {
    // 사용자에게 League 설치 경로 입력 요청
    const path = await promptUserForPath()
    const credentials = await authenticate({
      awaitConnection: true,
      leagueInstallPath: path,
    })
  }
}
```

---

### LeagueWebSocket

LCU WebSocket 이벤트 버스에 연결한다.

```ts
import { createWebSocketConnection } from '@your-gg/league-connect'

const ws = await createWebSocketConnection({
  authenticationOptions: {
    awaitConnection: true,
  },
})

ws.subscribe('/lol-chat/v1/conversations/active', (data, event) => {
  // data: 이벤트 페이로드 (역직렬화된 JSON)
})
```

**옵션**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `authenticationOptions` | `{}` | `authenticate()`와 동일한 옵션 |
| `pollInterval` | `1000` | 재연결 시도 간격 (ms) |
| `maxRetries` | `10` | 최대 재연결 횟수 (`-1`은 무한 재시도) |

---

### HTTP 요청

```ts
import { authenticate, createHttp1Request } from '@your-gg/league-connect'

const credentials = await authenticate()
const response = await createHttp1Request({
  method: 'GET',
  url: '/lol-summoner/v1/current-summoner',
}, credentials)

const data = response.json()
```

HTTP/2 사용 시:

```ts
import { authenticate, createHttpSession, createHttp2Request } from '@your-gg/league-connect'

const credentials = await authenticate()
const session = createHttpSession(credentials)
const response = await createHttp2Request({
  method: 'GET',
  url: '/lol-summoner/v1/current-summoner',
}, session, credentials)

session.close()
```

---

### LeagueClient

League 클라이언트 시작/종료 이벤트를 모니터링한다.

```ts
import { authenticate, LeagueClient } from '@your-gg/league-connect'

const credentials = await authenticate()
const client = new LeagueClient(credentials, { pollInterval: 2500 })

client.on('connect', (newCredentials) => { /* League 시작됨 */ })
client.on('disconnect', () => { /* League 종료됨 */ })

client.start()
client.stop()
```
