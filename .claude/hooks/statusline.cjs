#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function readJsonIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return null;
  }
}

function buildContextBar(remainingPercentage) {
  if (remainingPercentage == null) return '';
  const remaining = Math.round(Number(remainingPercentage));
  if (!Number.isFinite(remaining)) return '';
  const used = Math.max(0, Math.min(100, 100 - remaining));
  const filled = Math.floor(used / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  if (process.env.NO_COLOR) {
    return ` ${bar} ${used}%`;
  }

  if (used < 50) return ` \x1b[32m${bar} ${used}%\x1b[0m`;
  if (used < 65) return ` \x1b[33m${bar} ${used}%\x1b[0m`;
  if (used < 80) return ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
  return ` \x1b[5;31m${bar} ${used}%\x1b[0m`;
}

function getTodosDir() {
  return (
    process.env.STATUSLINE_TODOS_DIR ||
    path.join(os.homedir(), '.claude', 'todos')
  );
}

function getStateDir() {
  return process.env.STATUSLINE_STATE_DIR || path.join(process.cwd(), '.claude', 'state');
}

function getCurrentTask(sessionId) {
  const todosDir = getTodosDir();
  if (sessionId && fs.existsSync(todosDir)) {
    try {
      const files = fs
        .readdirSync(todosDir)
        .filter(
          file => file.startsWith(sessionId) && file.includes('-agent-') && file.endsWith('.json')
        )
        .map(file => ({
          name: file,
          mtime: fs.statSync(path.join(todosDir, file)).mtime,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        const todos = readJsonIfExists(path.join(todosDir, files[0].name));
        if (Array.isArray(todos)) {
          const inProgress = todos.find(item => item.status === 'in_progress');
          if (inProgress) {
            const raw = inProgress.activeForm || inProgress.content || '';
            return String(raw);
          }
        }
      }
    } catch (_err) {
      // ignore
    }
  }

  const stateFile = path.join(getStateDir(), 'current-task.json');
  const state = readJsonIfExists(stateFile);
  if (state && state.currentTask) {
    return String(state.currentTask);
  }
  return '';
}

function truncate(text, maxLength = 40) {
  if (!text) return '';
  const trimmed = String(text);
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function getMemoryHealthIndicator() {
  const healthFile = path.join(getStateDir(), 'memory-health.json');
  const health = readJsonIfExists(healthFile);
  if (health && (health.status === 'warning' || health.status === 'error')) {
    return process.env.NO_COLOR ? ' ⚠' : ' \x1b[33m⚠\x1b[0m';
  }
  return '';
}

function formatStatusline(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const model = payload.model?.display_name || 'Claude';
  const dir = payload.workspace?.current_dir || process.cwd();
  const sessionId = payload.session_id || '';
  const remaining = payload.context_window?.remaining_percentage;
  const contextBar = buildContextBar(remaining);
  const task = truncate(getCurrentTask(sessionId));
  const memoryHealth = getMemoryHealthIndicator();
  const dirname = path.basename(dir);

  if (task) {
    return `${memoryHealth}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${contextBar}`;
  }
  return `${memoryHealth}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${contextBar}`;
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    const payload = safeParseJson(input);
    const line = formatStatusline(payload);
    if (line) {
      process.stdout.write(line);
    }
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  formatStatusline,
  buildContextBar,
  getCurrentTask,
  truncate,
};
