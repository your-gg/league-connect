import cp from 'child_process'
import util from 'util'

const exec = util.promisify(cp.exec)

/**
 * 특정 프로세스가 살아 있는지 확인합니다.
 */
export async function isProcessRunning(name: string): Promise<boolean> {
  const pid = await getProcessId(name)
  return pid !== -1
}

/**
 * 프로세스 ID를 가져옵니다.
 */
export async function getProcessId(name: string): Promise<number> {
  const isWindows = process.platform === 'win32'
  
  try {
    let command: string
    if (isWindows) {
      command = `Get-CimInstance -Query "SELECT ProcessId from Win32_Process WHERE name LIKE '${name}.exe'" | Select-Object -ExpandProperty ProcessId`
    } else {
      // macOS/Linux: ps -ax에서 이름으로 필터링 후 PID(첫 번째 컬럼) 추출
      command = `ps -ax | grep "${name}" | grep -v grep | awk '{print $1}'`
    }

    const { stdout } = await exec(command, isWindows ? { shell: 'powershell' } : {})
    const pid = parseInt(stdout.trim().split('\n')[0], 10) // 여러 개일 경우 첫 번째 것 사용
    return isNaN(pid) ? -1 : pid
  } catch {
    return -1
  }
}

/**
 * 현재 실행 중인 모든 프로세스 이름 목록을 가져옵니다.
 */
export async function getAllProcessNames(): Promise<string[]> {
  const isWindows = process.platform === 'win32'
  
  try {
    if (isWindows) {
      const { stdout } = await exec('tasklist /NH /FO CSV')
      return stdout
        .split('\n')
        .map(line => line.split(',')[0].replace(/"/g, ''))
        .filter(name => name.trim() !== '')
    } else {
      // macOS/Linux: ps -ax에서 실행 경로/이름 컬럼만 추출
      // -c 옵션은 경로를 제외한 명령어 이름만 보여줍니다.
      const { stdout } = await exec("ps -ax -o comm | sed 1d")
      return stdout
        .split('\n')
        .map(line => line.trim())
        .filter(name => name !== '')
    }
  } catch {
    return []
  }
}