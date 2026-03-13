'use strict';

/**
 * Main execution script for transcription skill.
 * Wraps the transcribe-anything CLI with validation and structured output.
 *
 * Usage:
 *   node main.cjs --input <file_or_url> [options]
 *
 * Options:
 *   --input     Path to audio/video file or URL (required)
 *   --model     Model size: tiny|small|medium|large|large-v3 (default: large-v3)
 *   --lang      Language code e.g. en, fr, de (default: auto-detect)
 *   --device    Backend: cpu|cuda|mlx|insane|groq (default: auto)
 *   --output_dir  Output directory (default: ./)
 *   --task      transcribe|translate (default: transcribe)
 *   --hf_token  HuggingFace token for speaker diarization
 *   --initial_prompt  Domain vocabulary hint
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function buildCommand(args) {
  const cmd = ['transcribe-anything', args.input];

  if (args.model) cmd.push('--model', args.model);
  if (args.lang) cmd.push('--lang', args.lang);
  if (args.device) cmd.push('--device', args.device);
  if (args.output_dir) cmd.push('--output_dir', args.output_dir);
  if (args.task) cmd.push('--task', args.task);
  if (args.hf_token) cmd.push('--hf_token', args.hf_token);
  if (args.initial_prompt) cmd.push('--initial_prompt', args.initial_prompt);
  if (args.batch_size) cmd.push('--batch_size', String(args.batch_size));

  return cmd;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    process.stderr.write('Error: --input is required\n');
    process.stderr.write('Usage: node main.cjs --input <file_or_url> [options]\n');
    process.exit(1);
  }

  const cmdArgs = buildCommand(args);
  const [executable, ...execArgs] = cmdArgs;

  process.stdout.write(JSON.stringify({ status: 'starting', command: cmdArgs.join(' ') }) + '\n');

  const child = spawn(executable, execArgs, {
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let _stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    _stdout += data.toString();
    process.stdout.write(data);
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
    process.stderr.write(data);
  });

  child.on('close', (code) => {
    const success = code === 0;
    const outputDir = args.output_dir || './';

    const result = {
      success,
      outputDir: path.resolve(outputDir),
      exitCode: code,
      stderr: success ? undefined : stderr.slice(-500),
    };

    if (success) {
      process.stdout.write('\n' + JSON.stringify(result) + '\n');
      process.exit(0);
    } else {
      process.stderr.write('\n' + JSON.stringify({ ...result, error: `transcribe-anything exited with code ${code}` }) + '\n');
      process.exit(1);
    }
  });

  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      process.stderr.write(
        'Error: transcribe-anything not found. Install with: pip install transcribe-anything\n'
      );
    } else {
      process.stderr.write(`Error: ${err.message}\n`);
    }
    process.exit(1);
  });
}

main();
