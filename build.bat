@echo off
REM Prism - build + package (Windows)
setlocal
cd /d "%~dp0"

echo ==^> Installing dev dependencies (esbuild)...
call npm install --no-audit --no-fund || goto :fail

echo ==^> Generating icons...
call npm run icons || goto :fail

echo ==^> Building dist/...
call npm run build || goto :fail

echo ==^> Running self-diagnostics...
call npm test || goto :fail

echo ==^> Packaging zip...
call node scripts\pack.js || goto :fail

echo Done. dist\prism-v*.zip is ready for the Chrome Web Store.
exit /b 0

:fail
echo BUILD FAILED.
exit /b 1
