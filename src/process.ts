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