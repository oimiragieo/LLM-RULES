#!/usr/bin/env node
'use strict';
/* eslint-disable no-unused-vars */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { writeHandoverLog } = require('../.claude/lib/context/shift-change-log-writer.cjs');
const { getOrCreateSessionId } = require('../.claude/lib/context/session-id-manager.cjs');
const { enterDrainMode } = require('../.claude/lib/context/drain-state.cjs');

// Parse CLI options
const args = process.argv.slice(2);
const skipDrain = args.includes('--skip-drain');
const claudeFlags = args.includes('--flags') ? args[args.indexOf('--flags') + 1] : '--dangerously-skip-permissions -d';
const resumeInstructions = args.includes('--message') ? args[args.indexOf('--message') + 1] : 'Please continue the current task from the handoff inbox.';

function spawnDetached(bin, spawnArgs, cwd) {
  const opts = {
    shell: false,
    detached: true,
    stdio: 'ignore',
  };
  if (cwd) opts.cwd = cwd;
  const proc = spawn(bin, spawnArgs, opts);
  proc.unref();
  return proc;
}

function spawnMacOS(cmd, cwd) {
  const termProg = process.env.TERM_PROGRAM || '';
  const fullCommand = cwd ? `cd ${JSON.stringify(cwd)} && ${cmd}` : cmd;
  const escaped = fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  let script;
  if (termProg === 'iTerm.app') {
    script = `
tell application "iTerm"
  create window with default profile command "/bin/bash -c \\"${escaped}\\""
end tell`;
  } else {
    script = `
tell application "Terminal"
  if it is running then
    do script "${escaped}"
  else
    do script "${escaped}" in window 1
  end if
  activate
end tell`;
  }

  return spawnDetached('osascript', ['-e', script], cwd);
}

function detectLinuxTerminal() {
  const candidates = [
    'wezterm', 'kitty', 'alacritty', 'gnome-terminal',
    'konsole', 'xfce4-terminal', 'xterm',
  ];
  for (const bin of candidates) {
    try {
      execFileSync('which', [bin], { stdio: 'pipe' });
      return bin;
    } catch {
      // not found
    }
  }
  return 'xterm';
}

function spawnLinuxHeadless(cmd, cwd) {
  try {
    execFileSync('which', ['tmux'], { stdio: 'pipe' });
    const sessionName = `context-handoff-${Date.now()}`;
    const tmuxArgs = ['new-session', '-d', '-s', sessionName];
    if (cwd) tmuxArgs.push('-c', cwd);
    tmuxArgs.push(cmd);
    execFileSync('tmux', tmuxArgs, { stdio: 'ignore' });
    console.log(`[spawn-new-session] Created tmux session '${sessionName}'.`);
    console.log(`[spawn-new-session] Attach with: tmux attach -t ${sessionName}`);
  } catch {
    console.warn('[spawn-new-session] No GUI display and no tmux. Open a new terminal and run:');
    console.warn(`[spawn-new-session]   ${cmd}`);
  }
}

function spawnLinux(cmd, cwd) {
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return spawnLinuxHeadless(cmd, cwd);
  }

  const terminal = detectLinuxTerminal();
  const fullCommand = cwd ? `cd ${JSON.stringify(cwd)} && ${cmd}` : cmd;

  switch (terminal) {
    case 'wezterm':
      return spawnDetached('wezterm', ['start', '--', 'bash', '-c', fullCommand], cwd);
    case 'kitty':
      return spawnDetached('kitty', ['--', 'bash', '-c', fullCommand], cwd);
    case 'alacritty':
      return spawnDetached('alacritty', ['-e', 'bash', '-c', fullCommand], cwd);
    case 'gnome-terminal':
      return spawnDetached('gnome-terminal', ['--', 'bash', '-c', fullCommand], cwd);
    case 'konsole':
      return spawnDetached('konsole', ['-e', 'bash', '-c', fullCommand], cwd);
    case 'xfce4-terminal':
      return spawnDetached('xfce4-terminal', ['-e', `bash -c ${JSON.stringify(fullCommand)}`], cwd);
    case 'xterm':
    default:
      return spawnDetached('xterm', ['-e', 'bash', '-c', fullCommand], cwd);
  }
}

function spawnTerminalWindow(cmd, opts = {}) {
  const platform = process.platform;

  if (process.env.TMUX) {
    return spawnDetached('tmux', ['new-window', cmd], opts.cwd);
  }

  if (process.env.ZELLIJ) {
    return spawnDetached('zellij', ['action', 'new-tab', '--command', cmd], opts.cwd);
  }

  if (platform === 'win32') {
    if (process.env.WT_SESSION) {
      const wtArgs = ['/c', 'start', '', 'wt', '-w', 'new', 'new-tab'];
      if (opts.cwd) wtArgs.push('-d', opts.cwd);
      wtArgs.push('--title', 'Claude New Session', 'cmd', '/k', cmd);
      return spawnDetached('cmd.exe', wtArgs, opts.cwd);
    }
    const psCmd = opts.cwd
      ? `Start-Process cmd.exe -WorkingDirectory ${JSON.stringify(opts.cwd)} -ArgumentList '/k ${cmd.replace(/'/g, "''")}'`
      : `Start-Process cmd.exe -ArgumentList '/k ${cmd.replace(/'/g, "''")}'`;
    return spawnDetached('powershell', ['-Command', psCmd], opts.cwd);
  }

  if (platform === 'darwin') {
    return spawnMacOS(cmd, opts.cwd);
  }

  if (platform === 'linux') {
    return spawnLinux(cmd, opts.cwd);
  }

  console.warn(`[spawn-new-session] Unsupported platform: ${platform}. Open a terminal manually and run: ${cmd}`);
}

function main() {
  console.log(`[spawn-new-session] Initiating context handoff...`);
  const runtimeDir = path.join(process.cwd(), '.claude/context/runtime');

  // 1. Get current session
  const sessionId = getOrCreateSessionId(runtimeDir);

  // 2. Draft the handover log
  const handoverData = {
    schemaVersion: "1.0.0",
    generation: 1,
    sessionId: sessionId,
    resumeInstructions: resumeInstructions,
    contextSummary: "Handoff initiated via spawn-new-session.cjs",
    pendingMemoryWrites: [],
    pendingActions: []
  };

  try {
    writeHandoverLog(handoverData, runtimeDir);
    console.log(`[spawn-new-session] Wrote READY handover log for session ${sessionId}.`);
  } catch (error) {
    console.error(`[spawn-new-session] Failed to write handover log: ${error.message}`);
    process.exit(1);
  }

  // 3. Mark the current session as draining (to block new TaskCreate) unless skipped
  if (!skipDrain) {
    enterDrainMode({ sessionId, drainDeadlineMinutes: 2 }, runtimeDir);
    console.log(`[spawn-new-session] Session ${sessionId} entered DRAIN mode.`);
  }

  // 4. Spawn the new terminal.
  // Strategy: run claude in -p (print/headless) mode first with a seed prompt.
  //   - The UserPromptSubmit hook fires, claims the baton, writes the ACK, and
  //     injects the full handover context alongside the seed prompt.
  //   - Claude processes the context and starts working autonomously (Step 0, etc.)
  //   - When the -p turn completes the session is persisted to disk.
  //   - Then `claude --continue` opens interactive mode on that same session so
  //     the user can take over or review output.
  // We unset CLAUDECODE so the child process doesn't see a nested-session error.
  // Single word — no quotes needed, avoids breaking the outer cmd /k "..." quoting on Windows
  const seedPrompt = 'continue';
  let cleanCommand;
  if (process.platform === 'win32') {
    cleanCommand = `set CLAUDECODE= && claude ${claudeFlags} -p ${seedPrompt} && claude ${claudeFlags} -c`;
  } else {
    cleanCommand = `unset CLAUDECODE && claude ${claudeFlags} -p ${seedPrompt} && claude ${claudeFlags} -c`;
  }

  console.log(`[spawn-new-session] Spawning new terminal window with: ${cleanCommand}`);
  spawnTerminalWindow(cleanCommand, { cwd: process.cwd() });

  // 5. Fire-and-forget — the old session exits immediately after spawning.
  //    The new session's UserPromptSubmit hook writes the ACK to both:
  //      - .claude/context/runtime/shift-change-ack.json  (runtime sentinel)
  //      - .claude/context/memory/handoff_inbox.md         (durable memory record)
  //    No need to block here waiting for the new window to finish starting.
  //    Use scripts/wait-for-handoff.mjs manually for debugging if needed.
  console.log(`[spawn-new-session] Handoff initiated. New session will ACK via memory on first prompt.`);
  console.log(`[spawn-new-session] Safe to exit. Check handoff_inbox.md for confirmation.`);
}

 
if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(`[spawn-new-session] Fatal error initialized: ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}
 

module.exports = { spawnTerminalWindow };
