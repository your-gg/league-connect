# @your-gg/league-connect

Node.js module for consuming the League of Legends Client (LCU) APIs.

Fork of [matsjla/league-connect](https://github.com/matsjla/league-connect) with authentication reliability improvements, better error handling, and GitHub Packages distribution.

[한국어](./README.ko.md)

## Releases

```sh
# Run from master branch after all commits are ready
npm run release -- v1.0.2        # stable (latest)
npm run release -- v1.0.2-beta.1 # pre-release (beta)
```

The script validates semver, checks origin sync, creates a tag, and pushes. CI runs tests → build → publish.

> Install a beta version with `npm install @your-gg/league-connect@beta`. Does not affect `latest`.

## Installation

This package is published to **GitHub Packages**. Add the following to your project's `.npmrc`:

```ini
@your-gg:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_TOKEN}
always-auth=true
```

Then install:

```sh
npm install @your-gg/league-connect
# or
yarn add @your-gg/league-connect
```

> `GH_TOKEN` needs `read:packages` scope. In CI, use `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

## Usage

### authenticate

Locates a running League Client and returns LCU API credentials.

```ts
import { authenticate } from '@your-gg/league-connect'

const credentials = await authenticate()
// { port: 54321, password: 'abc123', pid: 12345, certificate: '...' }
```

**Options**

| Option | Default | Description |
|--------|---------|-------------|
| `awaitConnection` | `false` | Keep polling until League is found |
| `pollInterval` | `2500` | Poll interval in ms (requires `awaitConnection: true`) |
| `leagueInstallPath` | `undefined` | Manual install path — use when auto-discovery fails |
| `certificate` | Riot's cert | Custom PEM certificate for LCU HTTPS |
| `unsafe` | `false` | Skip certificate validation |
| `name` | `LeagueClientUx` | Process name (set to `RiotClientUx` for Riot Client) |
| `windowsShell` | `powershell` | Windows shell (`powershell` or `cmd`) |
| `useDeprecatedWmic` | `false` | Use WMIC instead of CIM (Windows 7 only) |

```ts
const credentials = await authenticate({
  awaitConnection: true,
  pollInterval: 2500,
})
```

#### Error handling

| Error | When |
|-------|------|
| `ClientNotFoundError` | League not running or install path not yet available |
| `ClientInstallNotFoundError` | League running but install directory cannot be found — prompt user for path |
| `ClientElevatedPermsError` | League running as administrator |
| `ClientAuthTimeoutError` | Found process but failed to retrieve auth info repeatedly |
| `InvalidPlatformError` | Not running on Windows / macOS / Linux |

**Manual install path example**

```ts
import { authenticate, ClientInstallNotFoundError } from '@your-gg/league-connect'

try {
  const credentials = await authenticate({ awaitConnection: true })
} catch (err) {
  if (err instanceof ClientInstallNotFoundError) {
    // Ask user where League is installed
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

Connects to the LCU WebSocket event bus.

```ts
import { createWebSocketConnection } from '@your-gg/league-connect'

const ws = await createWebSocketConnection({
  authenticationOptions: {
    awaitConnection: true,
  },
})

ws.subscribe('/lol-chat/v1/conversations/active', (data, event) => {
  // data: deserialized event payload
})
```

**Options**

| Option | Default | Description |
|--------|---------|-------------|
| `authenticationOptions` | `{}` | Same options as `authenticate()` |
| `pollInterval` | `1000` | ms between reconnect attempts |
| `maxRetries` | `10` | Max reconnect attempts (`-1` for infinite) |

---

### HTTP Requests

```ts
import { authenticate, createHttp1Request } from '@your-gg/league-connect'

const credentials = await authenticate()
const response = await createHttp1Request({
  method: 'GET',
  url: '/lol-summoner/v1/current-summoner',
}, credentials)

const data = response.json()
```

For HTTP/2:

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

Monitors League Client start/stop events.

```ts
import { authenticate, LeagueClient } from '@your-gg/league-connect'

const credentials = await authenticate()
const client = new LeagueClient(credentials, { pollInterval: 2500 })

client.on('connect', (newCredentials) => { /* League started */ })
client.on('disconnect', () => { /* League closed */ })

client.start()
client.stop()
```
