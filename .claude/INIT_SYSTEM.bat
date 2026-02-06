@echo off
REM Agent Studio System Initialization Script for Windows
REM Run this to fully activate all subsystems

echo ==========================================
echo Agent Studio System Initialization
echo ==========================================
echo.

REM Check if we're in the right directory
if not exist "package.json" (
  echo ERROR: Run this script from agent-studio root directory
  exit /b 1
)

echo [1/5] Installing dependencies...
call pnpm install
if errorlevel 1 (
  echo FAILED: npm install
  exit /b 1
)

echo.
echo [2/5] Initializing memory system...
node .claude/tools/cli/init-memory-db.cjs
if errorlevel 1 (
  echo WARNING: Memory init may have failed
)

echo.
echo [3/5] Building code index...
node .claude/tools/cli/index-codebase.cjs index
if errorlevel 1 (
  echo WARNING: Code indexing may have failed
)

echo.
echo [4/5] Regenerating all registries...
call pnpm gen:all-registries
if errorlevel 1 (
  echo WARNING: Registry generation may have failed
)

echo.
echo [5/5] Validating configuration...
call pnpm validate:full
if errorlevel 1 (
  echo WARNING: Validation found issues - see above
)

echo.
echo ==========================================
echo Initialization Complete!
echo ==========================================
echo.
echo Next steps:
echo   - Run 'pnpm code:index:reindex' to refresh code index after file changes
echo   - Set WORKER_ENABLED=1 and run 'pnpm agent:worker' for maintenance mode
echo   - Start coding with 'claude' command
