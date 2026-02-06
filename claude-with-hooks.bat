@echo off
REM Claude Wrapper with Hook Support
REM Sets NODE_PATH dynamically based on script location

echo [Claude Wrapper] Setting up environment...

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

REM Remove trailing backslash
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Set NODE_PATH to .claude/lib relative to script location
set "NODE_PATH=%SCRIPT_DIR%\.claude\lib"

REM Set PROJECT_ROOT to script location
set "PROJECT_ROOT=%SCRIPT_DIR%"

echo [Claude Wrapper] NODE_PATH=%NODE_PATH%
echo [Claude Wrapper] PROJECT_ROOT=%PROJECT_ROOT%
echo [Claude Wrapper] Starting Claude Code...
echo.

REM Run claude with all arguments passed through
claude %*
