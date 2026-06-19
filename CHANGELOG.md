# Changelog

All notable changes to this project are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [2.0.0]

### Removed (BREAKING)

This fork is now scoped to its single consumer (yourgg-app), so unused surface was dropped:

- **HTTP/2** — `createHttp2Request`, `createHttpSession`, `Http2Response` (and `src/http2.ts`).
  The app uses HTTP/1.1 (`createHttp1Request`) only. (This also removes the latent bug where
  `createHttpSession` ignored `unsafe`/custom-certificate and always used the bundled cert.)
- **`LeagueClient` / `LeagueClientOptions`** (`src/client.ts`) — the app drives its own
  connection state machine; it never used the library's poller.
- **Deprecated v5 shims** — `DEPRECATED_request`, `DEPRECATED_connect` and friends
  (`src/request_deprecated.ts`, `src/websocket_deprecated.ts`), plus the stale `MIGRATION-V5.md`.

### Changed

- **Detection is now lockfile-first.** `authenticate()` resolves credentials from the
  install directory's `lockfile` using filesystem reads only — no process spawn. The legacy
  process-command-line scan (PowerShell `Get-CimInstance` on Windows) now runs **only as a
  fallback** when the install dir cannot be located or the lockfile cannot be read (e.g. an
  elevated client). While the client is closed, an installed League now incurs roughly
  **zero process spawns** per poll, eliminating the idle CPU/battery drain from repeated
  PowerShell cold-starts. The install-directory resolution is cached (file-based,
  self-validating). A non-default `name` (e.g. `RiotClientUx`) bypasses the lockfile path.

### Added

- `WsConnectionRefusedError` — thrown by `createWebSocketConnection` when retries are
  exhausted on `ECONNREFUSED` (previously a plain `Error`, which consumers could only
  distinguish by message). Fixes misclassification of a transient/stale refused connection.
- `ws.credentials` — `createWebSocketConnection` now exposes the credentials it used on the
  returned `LeagueWebSocket`, so they can be reused for `createHttp1Request`.
- `clearInstallDirCache()` — invalidates the cached install-directory resolution.
- `isPidAlive(pid)` (in `process`) — spawn-free liveness check used to detect a stale
  lockfile (a `lockfile` left after a crash whose port no longer listens).
- `LockfileAuthInfo.pid` — `readLockfile()` now also returns the PID recorded in the
  lockfile (best-effort; used for the staleness guard).

### Fixed

- A stale lockfile (dead PID) is now reported as "not running" (`ClientNotFoundError`)
  instead of yielding credentials for a dead port.
- The client-off path no longer relies on an exception thrown by destructuring a `null`
  regex match; it is now an explicit, spawn-free branch.
- The elevated-client probe (`Get-Process`) is now wrapped in try/catch: a shell failure
  (PowerShell missing / spawn error) can no longer escape `authenticate()` as a raw error,
  preserving the documented contract that only domain errors (e.g. `ClientNotFoundError`)
  are thrown — consumers that branch on `instanceof ClientNotFoundError` keep working.
- The staleness guard is now conservative: a lockfile with an unparseable/zero PID falls
  back to the process scan instead of returning unverified credentials (previously a `NaN`
  PID skipped the guard entirely via the `> 0` short-circuit).
- The WebSocket message handler now isolates each subscriber callback, so one throwing
  subscriber no longer aborts the remaining subscribers registered for the same URI.
- **Install-dir auto-discovery returned the wrong directory.** Riot's metadata yaml carries
  both `product_install_full_path` (the actual `…\League of Legends` folder) and
  `product_install_root` (its parent `…\Riot Games`); discovery preferred `root`, so
  lockfile-first looked for the lockfile in the parent and threw `ClientNotFoundError` **even
  while League was running** (only on the auto-discovery path, i.e. without `leagueInstallPath`).
  Discovery now prefers `product_install_full_path`. As defense-in-depth, if the resolved
  directory has no lockfile **and** no `LeagueClient.exe` marker, detection falls back to the
  process scan instead of falsely reporting "not running".
- Connection-establishment failures other than `ECONNREFUSED` (e.g. `ECONNRESET`, TLS
  "wrong version number" — seen when a stale lockfile's freed port has been reclaimed by
  another local service) are now also wrapped as `WsConnectionRefusedError` (retryable) instead
  of propagating raw, so consumers keep polling rather than treating it as an unknown/fatal error.
- **`ClientElevatedPermsError` is now actually thrown.** It was defined/exported but never
  raised, so a client running **as administrator** (command line + lockfile unreadable) leaked
  out as `ClientNotFoundError`/`ClientInstallNotFoundError`. `authenticate()` now, after failing
  to obtain credentials, raises `ClientElevatedPermsError` **before** falling back to
  install-not-found when the client is detected as elevated — letting consumers prompt "run as
  administrator" (the real fix) instead of an install-path picker. Credentials are still returned
  directly whenever the elevated client's lockfile happens to be readable.

### Notes

- `Credentials.pid` on the lockfile-first path is taken from the lockfile (the
  `LeagueClient` process) rather than the `LeagueClientUx` `--app-pid`. Both processes
  start and stop together in normal operation.
