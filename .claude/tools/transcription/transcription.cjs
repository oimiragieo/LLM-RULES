'use strict';

/**
 * CLI companion tool for transcription skill.
 * Provides a thin wrapper around the transcription skill's main.cjs.
 *
 * Usage:
 *   node .claude/tools/transcription/transcription.cjs --input <file_or_url> [options]
 */

const path = require('path');
const { spawn } = require('child_process');

const SKILL_MAIN = path.resolve(__dirname, '../../skills/transcription/scripts/main.cjs');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  process.stdout.write(`
Transcription CLI Tool
======================
Transcribe audio/video files or URLs using Whisper AI.

Usage:
  node transcription.cjs --input <file_or_url> [options]

Options:
  --input <path|url>     File path or URL (required)
  --model <size>         tiny|small|medium|large|large-v3 (default: large-v3)
  --lang <code>          Language code e.g. en, fr (default: auto-detect)
  --device <backend>     cpu|cuda|mlx|insane|groq (default: auto)
  --output_dir <dir>     Output directory (default: ./)
  --task <type>          transcribe|translate (default: transcribe)
  --hf_token <token>     HuggingFace token for speaker diarization
  --initial_prompt <str> Domain vocabulary hint

Examples:
  node transcription.cjs --input podcast.mp3
  node transcription.cjs --input audio.mp3 --model large-v3 --lang en
  node transcription.cjs --input "https://youtube.com/watch?v=..." --output_dir ./transcripts/
`);
  process.exit(0);
}

// Forward all args to skill main.cjs
const child = spawn(process.execPath, [SKILL_MAIN, ...args], {
  shell: false,
  stdio: 'inherit',
});

child.on('close', code => {
  process.exit(code || 0);
});

child.on('error', err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
