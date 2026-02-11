// 로그 자동 수집 및 저장 스크립트
(function() {
  window.appLogs = {
    console: [],
    errors: [],
    network: [],
    startTime: new Date().toISOString()
  };

  // Console.log 캡처
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = function(...args) {
    window.appLogs.console.push({
      time: new Date().toISOString(),
      type: 'log',
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    });
    originalLog.apply(console, args);
  };

  console.error = function(...args) {
    window.appLogs.errors.push({
      time: new Date().toISOString(),
      type: 'error',
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    });
    originalError.apply(console, args);
  };

  console.warn = function(...args) {
    window.appLogs.console.push({
      time: new Date().toISOString(),
      type: 'warn',
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    });
    originalWarn.apply(console, args);
  };

  // 에러 캡처
  window.addEventListener('error', (e) => {
    window.appLogs.errors.push({
      time: new Date().toISOString(),
      type: 'runtime_error',
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno
    });
  });

  // Promise rejection 캡처
  window.addEventListener('unhandledrejection', (e) => {
    window.appLogs.errors.push({
      time: new Date().toISOString(),
      type: 'promise_rejection',
      message: e.reason?.toString() || 'Unknown promise rejection'
    });
  });

  // 로그 다운로드 함수
  window.downloadLogs = function() {
    const content = JSON.stringify(window.appLogs, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-logs-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('✅ 로그가 다운로드되었습니다!');
  };

  // 로그 초기화 함수
  window.clearLogs = function() {
    window.appLogs = {
      console: [],
      errors: [],
      network: [],
      startTime: new Date().toISOString()
    };
    console.log('🗑️ 로그가 초기화되었습니다!');
  };

  // 자동 저장 (5분마다)
  setInterval(() => {
    if (window.appLogs.console.length > 0 || window.appLogs.errors.length > 0) {
      localStorage.setItem('app_logs_backup', JSON.stringify(window.appLogs));
      console.log('💾 로그 자동 백업 완료');
    }
  }, 5 * 60 * 1000);

  console.log('🎯 로그 모니터링 시작!');
  console.log('📥 로그 다운로드: window.downloadLogs()');
  console.log('🗑️ 로그 초기화: window.clearLogs()');
})();
