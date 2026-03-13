'use strict';

/**
 * Pre-execution hook for transcription skill.
 * Validates input against input.schema.json before execution.
 */

const path = require('path');
const fs = require('fs');

const SCHEMA_PATH = path.resolve(__dirname, '../schemas/input.schema.json');

function preExecute(input = {}) {
  try {
    // Validate schema file exists
    if (!fs.existsSync(SCHEMA_PATH)) {
      process.stderr.write('[pre-execute:transcription] Schema file not found, skipping validation\n');
      return { continue: true };
    }

    // Require input field
    if (!input.input || typeof input.input !== 'string' || input.input.trim() === '') {
      process.stderr.write(
        '[pre-execute:transcription] Validation failed: "input" field is required and must be a non-empty string\n'
      );
      process.exit(2);
    }

    // Validate model if provided
    const validModels = ['tiny', 'small', 'medium', 'large', 'large-v3', 'large-v2'];
    if (input.model && !validModels.includes(input.model)) {
      process.stderr.write(
        `[pre-execute:transcription] Validation failed: invalid model "${input.model}". Valid: ${validModels.join(', ')}\n`
      );
      process.exit(2);
    }

    // Validate device if provided
    const validDevices = ['cpu', 'cuda', 'mlx', 'insane', 'groq'];
    if (input.device && !validDevices.includes(input.device)) {
      process.stderr.write(
        `[pre-execute:transcription] Validation failed: invalid device "${input.device}". Valid: ${validDevices.join(', ')}\n`
      );
      process.exit(2);
    }

    // Validate task if provided
    const validTasks = ['transcribe', 'translate'];
    if (input.task && !validTasks.includes(input.task)) {
      process.stderr.write(
        `[pre-execute:transcription] Validation failed: invalid task "${input.task}". Valid: ${validTasks.join(', ')}\n`
      );
      process.exit(2);
    }

    // Warn if hf_token provided without insane device
    if (input.hf_token && input.device !== 'insane') {
      process.stderr.write(
        '[pre-execute:transcription] Warning: hf_token is only used with --device insane (speaker diarization)\n'
      );
    }

    return { continue: true };
  } catch (err) {
    // Fail-open on unexpected errors — do not block execution
    process.stderr.write(`[pre-execute:transcription] Unexpected error (fail-open): ${err.message}\n`);
    return { continue: true };
  }
}

module.exports = { preExecute };
