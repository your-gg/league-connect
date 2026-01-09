import cp from 'child_process'
import util from 'util'

const exec = util.promisify(cp.exec)

/**
 * 특정 프로세스가 살아 있는지 확인합니다.
 * @param name 프로세스 이름 (확장자 제외)
 * @returns 살아 있으면 true, 아니면 false
 */
export async function isProcessRunning(name: string): Promise<boolean> {
  const command = `Get-CimInstance -Query "SELECT ProcessId from Win32_Process WHERE name LIKE '${name}.exe'" | Select-Object -ExpandProperty ProcessId`

  try {
    const { stdout } = await exec(command, { shell: 'powershell' })
    
    const pid = stdout.trim()
    return pid !== '' && !isNaN(Number(pid))
  } catch (err) {
    return false
  }
}

/**
 * Fetch process id
 */
export async function getProcessId(name: string): Promise<number> {
  try {
    const command = `Get-CimInstance -Query "SELECT ProcessId from Win32_Process WHERE name LIKE '${name}.exe'" | Select-Object -ExpandProperty ProcessId`
    const { stdout } = await exec(command, { shell: 'powershell' })
    const pid = parseInt(stdout.trim(), 10)
    return isNaN(pid) ? -1 : pid
  } catch {
    return -1
  }
}

export async function getAllProcessNames(): Promise<string[]> {
  try {
    // tasklist 명령어가 Get-CimInstance보다 훨씬 빠르고 가볍게 목록만 가져옵니다.
    const { stdout } = await exec('tasklist /NH /FO CSV');
    
    // CSV 형식에서 프로세스 이름(첫 번째 컬럼)만 추출
    return stdout
      .split('\n')
      .map(line => line.split(',')[0].replace(/"/g, ''))
      .filter(name => name.trim() !== '');
  } catch {
    return [];
  }
}