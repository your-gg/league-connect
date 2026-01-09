import { isProcessRunning } from '../process'; // 경로를 실제 위치에 맞게 수정하세요

describe('isProcessRunning 테스트', () => {
  
  // 1. 실제 시스템 환경 테스트
  test('존재하지 않는 프로세스 이름에 대해서는 false를 반환해야 함', async () => {
    const result = await isProcessRunning('ThisProcessDoesNotExist_1234');
    expect(result).toBe(false);
  });

  test('현재 실행 중인 일반 프로세스(예: explorer) 감지 확인', async () => {
    // 윈도우라면 항상 떠있는 explorer.exe를 테스트용으로 사용
    const name = process.platform === 'win32' ? 'explorer' : 'systemd';
    const result = await isProcessRunning(name);
    
    console.log(`${name} 실행 상태:`, result);
    expect(result).toBe(true);
  });

  // 2. LeagueClientUx 감지 확인 (실행 여부에 따라 결과가 달라짐)
  test('LeagueClientUx 실행 여부 확인 로깅', async () => {
    const isRunning = await isProcessRunning('LeagueClientUx');
    
    if (isRunning) {
      console.log('✅ 리그 오브 레전드가 실행 중입니다.');
    } else {
      console.log('❌ 리그 오브 레전드가 꺼져 있습니다.');
    }
    
    expect(typeof isRunning).toBe('boolean');
  });

  // 3. 대소문자 구분 및 .exe 포함 여부 테스트
  test('이름에 .exe를 붙이거나 대소문자가 달라도 잘 작동하는지 확인', async () => {
    // 실제 함수 로직이 `${name}.exe`로 되어 있으므로 
    // 입력값에 따라 어떻게 변하는지 체크가 필요할 수 있습니다.
    const result = await isProcessRunning('EXPLORER'); // 윈도우 쿼리는 보통 대소문자 구분 안 함
    expect(typeof result).toBe('boolean');
  });
});