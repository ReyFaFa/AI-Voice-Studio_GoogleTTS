@echo off
chcp 65001 > nul
echo =========================================
echo    AI Voice Studio 업데이트 프로그램
echo =========================================
echo.
echo [1/2] GitHub에서 최신 코드를 강제로 다운로드하는 중...
git fetch --all
git reset --hard origin/main
git clean -fd

echo.
echo [2/2] 필요한 패키지를 업데이트하는 중...
call npm install

echo.
echo =========================================
echo 업데이트가 모두 완료되었습니다!
echo 이제 아무 키나 누르면 창이 닫히고, run_app.bat을 실행하시면 됩니다.
echo =========================================
pause
