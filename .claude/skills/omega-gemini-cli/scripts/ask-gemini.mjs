#!/usr/bin/env node
/**
 * Headless Gemini CLI: run Gemini with a prompt and optional model.
 * No MCP required. Uses: gemini -p "" [flags] with prompt via stdin
 * Usage: node ask-gemini.mjs "your prompt" [--model gemini-2.5-flash] [--json]
 *        echo "prompt" | node ask-gemini.mjs [--model gemini-2.5-flash] [--json]
 * Prompt is always sent via stdin to bypass shell argument length limits on all platforms.
 * Windows: shell: true is required to resolve the gemini.cmd wrapper.
 */
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { parseArgs } from './parse-args.mjs';
import { formatJsonOutput } from './format-output.mjs';

const { prompt, model, outputJson, sandbox } = parseArgs(process.argv.slice(2));

function run(promptText) {
  if (!promptText || !promptText.trim()) {
    console.error('Usage: node ask-gemini.mjs "prompt" [--model MODEL] [--json] [--sandbox]');
    process.exit(1);
  }

  const isWin = process.platform === 'win32';

  // The prompt is always written via stdin so it never hits shell argument length limits
  // (8191-char cmd.exe limit on Windows; ARG_MAX on Linux/macOS).
  // -p "" keeps Gemini in headless mode; it appends the -p value to stdin, so "" + stdin = stdin.
  //
  // On Windows with shell:true, Node joins the args array into a shell string.
  // An empty-string array element becomes nothing ("gemini -p  --yolo"), so Gemini sees -p
  // with no argument and errors. Instead, build the command as a string where "" is explicit.
  // On non-Windows, pass a proper args array — no shell quoting issues with empty strings.
  const runOptions = {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  };

  let executable;
  let execArgs;

  if (isWin) {
    // Validate model before injecting into the command string.
    // This regex check is critical for security, ensuring no arbitrary commands can be injected
    // when the 'model' variable is interpolated into the 'executable' command string for Windows.
    // The prompt content itself is securely passed via stdin, not command line arguments.
    if (model && !/^[a-zA-Z0-9._-]+$/.test(model)) {
      console.error('Error: --model contains invalid characters:', model);
      process.exit(1);
    }
    runOptions.shell = true;
    executable = `gemini -p "" --yolo${model ? ` -m ${model}` : ''}${sandbox ? ' -s' : ''}${outputJson ? ' --output-format json' : ''}`;
    execArgs = [];
  } else {
    // On non-Windows, pass flags as an array — no shell, no quoting issues.
    executable = 'gemini';
    execArgs = ['-p', '', '--yolo'];
    if (model) execArgs.push('-m', model);
    if (sandbox) execArgs.push('-s');
    if (outputJson) execArgs.push('--output-format', 'json');
  }

  // Keep cliArgs for the npx fallback (non-Windows only).
  const cliArgs = execArgs;

  function onClose(stdout, stderr, code, exe) {
    // Windows exit code 9009 = "command not found" (cmd.exe cannot resolve the executable).
    if (isWin && code === 9009 && exe === 'gemini') {
      console.error('Warning: gemini not found in PATH, falling back to npx (this may be slow)...');
      const npxArgs = ['-y', '@google/gemini-cli', '-p', '', '--yolo'];
      if (model) npxArgs.push('-m', model);
      if (sandbox) npxArgs.push('-s');
      if (outputJson) npxArgs.push('--output-format', 'json');
      runProc('npx', npxArgs);
      return;
    }

    if (code !== 0) {
      console.error(stderr || stdout);
      const hint =
        (stderr || stdout).toLowerCase().includes('not found') ||
        (stderr || stdout).toLowerCase().includes('command not found')
          ? '\nHint: Is the Gemini CLI installed and authenticated? Run: node .claude/skills/omega-gemini-cli/scripts/verify-setup.mjs'
          : '';
      if (hint) console.error(hint);
      process.exit(code ?? 1);
    }

    if (outputJson) {
      const { output, exitCode, warning } = formatJsonOutput(stdout);
      if (warning) process.stderr.write(warning + '\n');
      process.stdout.write(output);
      process.exit(exitCode);
    } else {
      process.stdout.write(stdout);
    }
  }

  function runProc(exe, args) {
    const proc = spawn(exe, args, runOptions);
    const stdoutChunks = [];
    const stderrChunks = [];
    proc.stdout.on('data', chunk => {
      stdoutChunks.push(chunk);
    });
    proc.stderr.on('data', chunk => {
      stderrChunks.push(chunk);
    });
    proc.on('close', code => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      onClose(stdout, stderr, code, exe);
    });
    proc.on('error', err => {
      if (err.code === 'ENOENT' && exe === 'gemini' && !isWin) {
        console.error(
          'Warning: gemini not found in PATH, falling back to npx (this may be slow)...'
        );
        runProc('npx', ['-y', '@google/gemini-cli', ...cliArgs]);
      } else {
        console.error('Failed to run gemini:', err.message);
        console.error(
          'Hint: Is the Gemini CLI installed? Run: node .claude/skills/omega-gemini-cli/scripts/verify-setup.mjs'
        );
        process.exit(1);
      }
    });
    // Prompt is sent via stdin — no .trim() so intentional leading/trailing whitespace is preserved.
    proc.stdin.on('error', () => {}); // ignore EPIPE if the process closes stdin early
    proc.stdin.write(promptText, 'utf8');
    proc.stdin.end();
  }

  runProc(executable, execArgs);
}

if (prompt) {
  run(prompt);
} else {
  const rl = createInterface({ input: process.stdin });
  const lines = [];
  rl.on('line', line => lines.push(line));
  rl.on('close', () => run(lines.join('\n')));
}
