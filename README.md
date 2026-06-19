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

**Detection strategy (lockfile-first).** Credentials are resolved from the install
directory's `lockfile` using only filesystem reads — no process spawn. The legacy
process-command-line scan (PowerShell `Get-CimInstance` on Windows) runs **only as a
fallback** when the install directory cannot be located or the lockfile cannot be read
(e.g. an elevated client). On **Windows** (the primary target), an app that polls while
League is closed therefore incurs roughly **zero process spawns** while idle. A stale
`lockfile` (left after a crash) is detected via the recorded PID and treated as "not
running". Resolution of the install directory is cached; call `clearInstallDirCache()`
to force re-resolution.

> On **macOS/Linux** the install directory is not auto-discovered — only `leagueInstallPath`
> (or the `LEAGUE_INSTALL_PATH` env var) is honored. Without one, detection falls back to
> the process scan (`ps`), so the spawn-free idle guarantee applies to Windows (or any
> platform where the install path is provided).

> Setting `name` to a non-default value (e.g. `RiotClientUx`) bypasses the lockfile path
> and uses the process scan, since the lockfile is specific to the League client.

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
| `ClientAuthTimeoutError` | Found process but failed to retrieve auth info repeatedly (`awaitConnection`) |
| `InvalidPlatformError` | Not running on Windows / macOS / Linux |
| `WsConnectionRefusedError` | `createWebSocketConnection` exhausted retries on `ECONNREFUSED` (client starting/closing, or stale lockfile) |

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

The credentials used by `createWebSocketConnection` are exposed on the returned socket as
`ws.credentials`, so you can reuse them for `createHttp1Request` without authenticating again.
