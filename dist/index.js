// src/authentication.ts
import cp2 from "child_process";
import util2 from "util";
import fs2 from "fs";
import path2 from "path";

// src/process.ts
import cp from "child_process";
import util from "util";
var exec = util.promisify(cp.exec);
async function getProcessId(name) {
  const isWindows = process.platform === "win32";
  try {
    let command;
    if (isWindows) {
      command = `Get-CimInstance -Query "SELECT ProcessId from Win32_Process WHERE name LIKE '${name}.exe'" | Select-Object -ExpandProperty ProcessId`;
    } else {
      command = `ps -ax | grep "${name}" | grep -v grep | awk '{print $1}'`;
    }
    const { stdout } = await exec(command, isWindows ? { shell: "powershell" } : {});
    const pid = parseInt(stdout.trim().split("\n")[0], 10);
    return isNaN(pid) ? -1 : pid;
  } catch {
    return -1;
  }
}
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0)
    return false;
  try {
    return process.kill(pid, 0);
  } catch (err) {
    return (err == null ? void 0 : err.code) === "EPERM";
  }
}
async function getAllProcessNames() {
  const isWindows = process.platform === "win32";
  try {
    if (isWindows) {
      const { stdout } = await exec("tasklist /NH /FO CSV");
      return stdout.split("\n").map((line) => line.split(",")[0].replace(/"/g, "")).filter((name) => name.trim() !== "");
    } else {
      const { stdout } = await exec("ps -ax -o comm | sed 1d");
      return stdout.split("\n").map((line) => line.trim()).filter((name) => name !== "");
    }
  } catch {
    return [];
  }
}

// src/cert.ts
var RIOT_GAMES_CERT = `
-----BEGIN CERTIFICATE-----
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
`;

// src/lockfile.ts
import fs from "fs";
import path from "path";
function getProgramDataDir() {
  return process.env.PROGRAMDATA || "C:\\ProgramData";
}
function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
function tryRootFromPath(installPath) {
  const root = path.resolve(installPath);
  return fileExists(root) ? root : null;
}
function tryRootFromEnv() {
  const envPath = process.env.LEAGUE_INSTALL_PATH;
  if (!envPath)
    return null;
  const root = path.resolve(envPath);
  return fileExists(root) ? root : null;
}
function tryRootFromMetadata() {
  const programData = getProgramDataDir();
  const metadataRoot = path.join(programData, "Riot Games", "Metadata");
  if (!fileExists(metadataRoot))
    return null;
  const entries = fs.readdirSync(metadataRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    if (!entry.name.toLowerCase().includes("league_of_legends"))
      continue;
    const dirPath = path.join(metadataRoot, entry.name);
    const files = fs.readdirSync(dirPath);
    const settingsFile = files.find((f) => f.endsWith(".product_settings.yaml"));
    if (!settingsFile)
      continue;
    const fullPath = path.join(dirPath, settingsFile);
    const yaml = fs.readFileSync(fullPath, "utf8");
    const rootMatch = yaml.match(/product_install_full_path:\s*"?(.+?)"?\s*$/m) || yaml.match(/product_install_root:\s*"?(.+?)"?\s*$/m);
    if (!rootMatch)
      continue;
    let root = rootMatch[1].trim();
    if (root.toLowerCase().endsWith(".exe")) {
      root = path.dirname(root);
    }
    if (fileExists(root))
      return root;
  }
  return null;
}
function tryRootFromRiotClientInstalls() {
  const programData = getProgramDataDir();
  const installsPath = path.join(programData, "Riot Games", "RiotClientInstalls.json");
  if (!fileExists(installsPath))
    return null;
  try {
    const raw = fs.readFileSync(installsPath, "utf8");
    const json = JSON.parse(raw);
    if (json.associated_client && typeof json.associated_client === "object") {
      for (const lolPath of Object.keys(json.associated_client)) {
        const lolRoot2 = path.normalize(lolPath);
        if (fileExists(lolRoot2))
          return lolRoot2;
      }
    }
    const values = Object.values(json).filter((p) => typeof p === "string");
    const anyPath = values.find((p) => p.toLowerCase().includes("riotclientservices.exe"));
    if (!anyPath)
      return null;
    const riotClientDir = path.dirname(anyPath);
    const riotRoot = path.resolve(riotClientDir, "..");
    const lolRoot = path.join(riotRoot, "League of Legends");
    if (fileExists(lolRoot))
      return lolRoot;
  } catch (e) {
    console.error("[league-connect] failed to parse RiotClientInstalls.json", e);
    return null;
  }
  return null;
}
function tryDefaultRoot() {
  const root = "C:\\Riot Games\\League of Legends";
  return fileExists(root) ? root : null;
}
function findLeagueInstallDir(installPath) {
  if (installPath) {
    const root = tryRootFromPath(installPath);
    if (root)
      return root;
  }
  return tryRootFromEnv() ?? tryRootFromMetadata() ?? tryRootFromRiotClientInstalls() ?? tryDefaultRoot();
}
function readLockfile(lockfilePath) {
  try {
    const raw = fs.readFileSync(lockfilePath, "utf8").trim();
    const parts = raw.split(":");
    if (parts.length < 5)
      return null;
    const pidStr = parts[1];
    const portStr = parts[2];
    const password = parts[3];
    const protocol = parts[4];
    const port = Number(portStr);
    if (!port || !password || !protocol)
      return null;
    const pid = Number(pidStr);
    return { pid, port, password, protocol };
  } catch (e) {
    console.error("[league-connect] failed to read lockfile:", e);
    return null;
  }
}

// src/authentication.ts
var exec2 = util2.promisify(cp2.exec);
var DEFAULT_NAME = "LeagueClientUx";
var DEFAULT_POLL_INTERVAL = 2500;
var cachedInstallDir = null;
function resolveInstallDir(installPath) {
  if (installPath)
    return findLeagueInstallDir(installPath);
  if (cachedInstallDir && fs2.existsSync(cachedInstallDir))
    return cachedInstallDir;
  cachedInstallDir = findLeagueInstallDir();
  return cachedInstallDir;
}
function clearInstallDirCache() {
  cachedInstallDir = null;
}
var InvalidPlatformError = class extends Error {
  constructor() {
    super("process runs on platform client does not support");
  }
};
var ClientNotFoundError = class extends Error {
  constructor() {
    super("League Client process could not be located");
  }
};
var ClientElevatedPermsError = class extends Error {
  constructor() {
    super("League Client has been detected but is running as administrator");
  }
};
var ClientInstallNotFoundError = class extends Error {
  constructor() {
    super("League Client installation path could not be located");
  }
};
var ClientAuthTimeoutError = class extends Error {
  pid;
  processList;
  constructor(pid, retries, processList) {
    super(`LeagueClient (PID: ${pid}) detected but failed to retrieve auth info after ${retries} attempts.`);
    this.name = "ClientAuthTimeoutError";
    this.pid = pid;
    this.processList = processList;
  }
};
async function authenticate(options) {
  const portRegex = /--app-port=([0-9]+)(?= *"| --)/;
  const passwordRegex = /--remoting-auth-token=(.+?)(?= *"| --)/;
  const pidRegex = /--app-pid=([0-9]+)(?= *"| --)/;
  const name = (options == null ? void 0 : options.name) ?? DEFAULT_NAME;
  const isWindows = process.platform === "win32";
  const executionOptions = isWindows ? { shell: (options == null ? void 0 : options.windowsShell) ?? "powershell" } : {};
  let retryCount = 0;
  const MAX_AUTH_RETRIES = 5;
  if (!["win32", "linux", "darwin"].includes(process.platform)) {
    throw new InvalidPlatformError();
  }
  function selectCertificate() {
    const unsafe = (options == null ? void 0 : options.unsafe) === true;
    const hasCert = (options == null ? void 0 : options.certificate) !== void 0;
    return hasCert ? options.certificate : unsafe ? void 0 : RIOT_GAMES_CERT;
  }
  function tryLockfileFirst() {
    if (name !== DEFAULT_NAME)
      return null;
    const installDir = resolveInstallDir(options == null ? void 0 : options.leagueInstallPath);
    if (!installDir)
      return null;
    const lockfilePath = path2.join(installDir, "lockfile");
    if (!fs2.existsSync(lockfilePath)) {
      if (isWindows && !fs2.existsSync(path2.join(installDir, "LeagueClient.exe"))) {
        return null;
      }
      throw new ClientNotFoundError();
    }
    const auth = readLockfile(lockfilePath);
    if (!auth)
      return null;
    if (!Number.isInteger(auth.pid) || auth.pid <= 0) {
      return null;
    }
    if (!isPidAlive(auth.pid)) {
      throw new ClientNotFoundError();
    }
    return {
      port: auth.port,
      pid: auth.pid,
      password: auth.password,
      certificate: selectCertificate()
    };
  }
  async function tryProcessCmdlineScan() {
    try {
      let command;
      if (!isWindows) {
        command = `ps x -o args | grep '${name}'`;
      } else if ((options == null ? void 0 : options.useDeprecatedWmic) === true) {
        command = `wmic process where "caption='${name}.exe'" get commandline`;
      } else {
        command = `Get-CimInstance -Query "SELECT * from Win32_Process WHERE name LIKE '${name}.exe'" | Select-Object -ExpandProperty CommandLine`;
      }
      const { stdout: rawStdout } = await exec2(command, executionOptions);
      const stdout = rawStdout.replace(/\n|\r/g, "");
      const portMatch = stdout.match(portRegex);
      const passwordMatch = stdout.match(passwordRegex);
      const pidMatch = stdout.match(pidRegex);
      if (!portMatch || !passwordMatch || !pidMatch) {
        throw new ClientNotFoundError();
      }
      return {
        port: Number(portMatch[1]),
        pid: Number(pidMatch[1]),
        password: passwordMatch[1],
        certificate: selectCertificate()
      };
    } catch (err) {
      if (options == null ? void 0 : options.__internalDebug)
        console.error(err);
      let isElevated = false;
      if (isWindows && ((options == null ? void 0 : options.windowsShell) ?? "powershell") === "powershell") {
        try {
          const { stdout: adminCheck } = await exec2(`if ((Get-Process -Name ${name} -ErrorAction SilentlyContinue | Where-Object {!$_.Handle -and !$_.Path})) {Write-Output "True"} else {Write-Output "False"}`, { shell: "powershell" });
          isElevated = adminCheck.includes("True");
        } catch {
          isElevated = false;
        }
      }
      const realPid = await getProcessId(name);
      if (isElevated || realPid !== -1) {
        const installDir = findLeagueInstallDir(options == null ? void 0 : options.leagueInstallPath);
        if (installDir) {
          const lockfilePath = path2.join(installDir, "lockfile");
          if (fs2.existsSync(lockfilePath)) {
            const auth = readLockfile(lockfilePath);
            if (auth) {
              return { port: auth.port, pid: realPid, password: auth.password, certificate: selectCertificate() };
            }
          }
        }
        if (isElevated) {
          throw new ClientElevatedPermsError();
        }
        if (!installDir) {
          throw new ClientInstallNotFoundError();
        }
        throw new ClientNotFoundError();
      }
      throw new ClientNotFoundError();
    }
  }
  async function tryAuthenticateInternal() {
    const fast = tryLockfileFirst();
    if (fast)
      return fast;
    return tryProcessCmdlineScan();
  }
  if (options == null ? void 0 : options.awaitConnection) {
    return new Promise(function self(resolve, reject) {
      tryAuthenticateInternal().then(resolve).catch(async (err) => {
        if (err instanceof ClientInstallNotFoundError) {
          reject(err);
          return;
        }
        if (err instanceof ClientNotFoundError || err instanceof ClientElevatedPermsError) {
          retryCount = 0;
          setTimeout(() => self(resolve, reject), (options == null ? void 0 : options.pollInterval) ?? DEFAULT_POLL_INTERVAL);
          return;
        }
        retryCount++;
        if (retryCount >= MAX_AUTH_RETRIES) {
          const allProcesses = await getAllProcessNames();
          reject(new ClientAuthTimeoutError(-1, MAX_AUTH_RETRIES, allProcesses));
        } else {
          setTimeout(() => self(resolve, reject), (options == null ? void 0 : options.pollInterval) ?? DEFAULT_POLL_INTERVAL);
        }
      });
    });
  }
  return tryAuthenticateInternal();
}

// src/http.ts
import https from "https";
import { TextEncoder } from "util";
import assert from "assert";

// src/trim.ts
function trim(s) {
  let r = s;
  while (r.startsWith("/")) {
    r = r.substring(1);
  }
  return r;
}

// src/http.ts
var Http1Response = class {
  constructor(_message, _raw) {
    this._message = _message;
    this._raw = _raw;
    assert(_message.complete, "Response constructor called with incomplete HttpIncomingMessage");
    const code = _message.statusCode;
    this.ok = code >= 200 && code < 300;
    this.redirected = [301, 302, 303, 307, 308].includes(code);
    this.status = code;
  }
  ok;
  redirected;
  status;
  json() {
    return JSON.parse(this._raw.toString());
  }
  text() {
    return this._raw.toString();
  }
  buffer() {
    return this._raw;
  }
  headers() {
    const headers = [];
    for (const [key, value] of Object.entries(this._message.headers)) {
      if (key.startsWith(":")) {
        continue;
      }
      if (value === void 0) {
        headers.push([key, ""]);
      } else if (Array.isArray(value)) {
        headers.push([key, value.join(", ")]);
      } else {
        headers.push([key, value]);
      }
    }
    return headers;
  }
};
async function createHttp1Request(options, credentials) {
  const agentOptions = credentials.certificate === void 0 ? { rejectUnauthorized: false } : { ca: credentials.certificate };
  return new Promise((resolve, reject) => {
    const request = https.request({
      host: "127.0.0.1",
      port: credentials.port,
      path: "/" + trim(options.url),
      method: options.method,
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`riot:${credentials.password}`).toString("base64")
      },
      agent: new https.Agent(agentOptions)
    }, (response) => {
      let buffer = [];
      response.on("data", (data) => void buffer.push(data));
      response.on("end", () => {
        try {
          resolve(new Http1Response(response, Buffer.concat(buffer)));
        } catch (jsonError) {
          reject(jsonError);
        }
      });
    });
    if (options.body !== void 0) {
      const data = JSON.stringify(options.body);
      const body = new TextEncoder().encode(data);
      request.write(body, "utf8");
    }
    request.on("error", (err) => reject(err));
    request.end();
  });
}

// src/websocket.ts
import https2 from "https";
import WebSocket from "ws";
var WsConnectionRefusedError = class extends Error {
  constructor(message = "Could not connect to LCU WebSocket API") {
    super(message);
    this.name = "WsConnectionRefusedError";
  }
};
function isConnectionRefusedMessage(message) {
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|EPROTO|ERR_SSL|wrong version number/i.test(message);
}
var LeagueWebSocket = class extends WebSocket {
  subscriptions = /* @__PURE__ */ new Map();
  credentials;
  constructor(address, options) {
    super(address, options);
    this.on("open", () => {
      this.send(JSON.stringify([5, "OnJsonApiEvent"]));
    });
    this.on("message", (content) => {
      let res;
      try {
        const json = JSON.parse(content);
        res = json.slice(2)[0];
      } catch {
        return;
      }
      if (!res || !this.subscriptions.has(res.uri))
        return;
      for (const cb of this.subscriptions.get(res.uri)) {
        try {
          cb(res.data, res);
        } catch {
        }
      }
    });
  }
  subscribe(path3, effect) {
    var _a;
    const p = `/${trim(path3)}`;
    if (!this.subscriptions.has(p)) {
      this.subscriptions.set(p, [effect]);
    } else {
      (_a = this.subscriptions.get(p)) == null ? void 0 : _a.push(effect);
    }
  }
  unsubscribe(path3) {
    const p = `/${trim(path3)}`;
    this.subscriptions.delete(p);
  }
};
async function createWebSocketConnection(options = {}) {
  const credentials = await authenticate(options.authenticationOptions);
  const url = `wss://riot:${credentials.password}@127.0.0.1:${credentials.port}`;
  return await new Promise((resolve, reject) => {
    const ws = new LeagueWebSocket(url, {
      headers: {
        Authorization: "Basic " + Buffer.from(`riot:${credentials.password}`).toString("base64")
      },
      agent: new https2.Agent(typeof (credentials == null ? void 0 : credentials.certificate) === "undefined" ? {
        rejectUnauthorized: false
      } : {
        ca: credentials == null ? void 0 : credentials.certificate
      })
    });
    ws.credentials = credentials;
    const errorHandler = ws.onerror = (err) => {
      var _a;
      options.__internalRetryCount = options.__internalRetryCount ?? 0;
      options.pollInterval = options.pollInterval ?? 1e3;
      options.maxRetries = options.maxRetries ?? 10;
      if (options.__internalMockFaultyConnection && options.__internalMockCallback) {
        if (err.message.includes("EndTestOpen") && options.__internalRetryCount >= options.maxRetries)
          resolve(ws);
        (_a = options.__internalMockCallback) == null ? void 0 : _a.call(options);
      }
      ws.close();
      if (isConnectionRefusedMessage(err.message)) {
        options.__internalRetryCount++;
        if (options.maxRetries === 0) {
          reject(new WsConnectionRefusedError("Could not connect to LCU WebSocket API"));
        } else if (options.maxRetries > 0 && options.__internalRetryCount > options.maxRetries) {
          reject(new WsConnectionRefusedError(`Could not connect to LCU WebSocket API after ${options.__internalRetryCount - 1} retries`));
        } else {
          setTimeout(() => {
            resolve(createWebSocketConnection(options));
          }, options.pollInterval);
        }
      } else {
        reject(err);
      }
    };
    if (options.__internalMockFaultyConnection) {
      ws.onopen = () => {
        ws.emit("error", new Error(`${options.__internalMockFaultyConnection}`));
        ws.removeListener("error", errorHandler);
      };
    } else {
      ws.onopen = () => {
        ws.removeListener("error", errorHandler);
        resolve(ws);
      };
    }
  });
}
export {
  ClientAuthTimeoutError,
  ClientElevatedPermsError,
  ClientInstallNotFoundError,
  ClientNotFoundError,
  Http1Response,
  InvalidPlatformError,
  LeagueWebSocket,
  WsConnectionRefusedError,
  authenticate,
  clearInstallDirCache,
  createHttp1Request,
  createWebSocketConnection
};
//# sourceMappingURL=index.js.map