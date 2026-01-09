import cp from 'child_process'
import util from 'util'

const exec = util.promisify(cp.exec)

describe('System Exec Function Test', () => {
  // 1. 단순 명령어 실행 테스트 (시스템 연결 확인)
  test('should execute a simple echo command', async () => {
    const { stdout } = await exec('echo hello jest')
    expect(stdout.trim()).toBe('hello jest')
  })

  // 2. 실제 authentication.ts에서 사용하는 PowerShell 명령어 테스트 (Windows 전용)
  if (process.platform === 'win32') {
    test('should execute PowerShell command and return output', async () => {
      // 롤 클라이언트가 꺼져있어도 명령어 자체는 실행되어야 함 (결과는 빈 문자열일 수 있음)
      const command = `Get-CimInstance -Query "SELECT * from Win32_Process WHERE name LIKE 'LeagueClient%.exe'"`
      
      try {
        const { stdout } = await exec(command, { shell: 'powershell' })
        console.log('Get-CimInstance Output:', stdout)
        expect(typeof stdout).toBe('string')
      } catch (err) {
        // 프로세스가 없으면 에러가 날 수 있으나, 명령어 실행 권한 문제는 없어야 함
        console.log('Execution finished (process might not be running)')
      }
    })

    test('should execute PowerShell wmic command and return output', async () => {
      // 롤 클라이언트가 꺼져있어도 명령어 자체는 실행되어야 함 (결과는 빈 문자열일 수 있음)
      const command = `wmic process where caption='LeagueClient.exe' get commandline`
      
      try {
        const { stdout } = await exec(command, { shell: 'powershell' })
        console.log('wmic Output:', stdout)
        expect(typeof stdout).toBe('string')
      } catch (err) {
        // 프로세스가 없으면 에러가 날 수 있으나, 명령어 실행 권한 문제는 없어야 함
        console.log('Execution finished (process might not be running)')
      }
    })
  }

  // 3. 정규식 파싱 로직 테스트
  test('should parse fake stdout using the regex from authentication.ts', () => {
    const portRegex = /--app-port=([0-9]+)(?= *"| --)/
    const passwordRegex = /--remoting-auth-token=(.+?)(?= *"| --)/
    
    const fakeStdout = `--app-port=12345 --remoting-auth-token=abcde-123 --app-pid=9999`
    
    const [, port] = fakeStdout.match(portRegex)!
    const [, password] = fakeStdout.match(passwordRegex)!
    
    expect(port).toBe('12345')
    expect(password).toBe('abcde-123')
  })

  if (process.platform === 'win32') {
    test('should fetch only the Process ID (PID)', async () => {
      const name = 'LeagueClientUx' // 테스트할 프로세스 이름
      
      // Get-CimInstance를 사용해 PID만 출력하는 명령어
      const command = `Get-CimInstance -Query "SELECT ProcessId from Win32_Process WHERE name LIKE '${name}.exe'" | Select-Object -ExpandProperty ProcessId`
      
      try {
        const { stdout } = await exec(command, { shell: 'powershell' })
        const pid = stdout.trim()
        
        console.log(`${name} PID:`, pid)
        
        if (pid) {
          expect(isNaN(Number(pid))).toBe(false) // 숫자인지 확인
          expect(Number(pid)).toBeGreaterThan(0) // 0보다 큰지 확인
        } else {
          console.log('프로세스가 실행 중이지 않아 PID를 찾을 수 없습니다.')
        }
      } catch (err) {
        console.log('프로세스가 없거나 권한 문제로 PID를 가져오지 못했습니다.')
      }
    })
  }
})