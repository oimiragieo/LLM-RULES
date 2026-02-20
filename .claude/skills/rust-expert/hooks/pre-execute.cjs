'use strict';

/**
 * rust-expert pre-execute hook
 *
 * Validates that the skill input contains the required fields before
 * the Rust expert workflow begins. Emits warnings for missing optional
 * but recommended fields.
 */

function preExecute(input = {}) {
  const warnings = [];
  const errors = [];

  // ── Required field: task ────────────────────────────────────────────────────
  if (!input.task || typeof input.task !== 'string' || input.task.trim() === '') {
    errors.push(
      'Missing required field "task": describe the Rust development task to perform ' +
        '(e.g. "implement async HTTP client", "fix lifetime error in parser")'
    );
  }

  // ── Recommended: context ────────────────────────────────────────────────────
  if (!input.context || typeof input.context !== 'string' || input.context.trim() === '') {
    warnings.push(
      'Recommended field "context" is missing: provide background about the Rust codebase ' +
        '(crate type, domain, existing dependencies, constraints)'
    );
  }

  // ── Recommended: target / filePath ─────────────────────────────────────────
  const hasTarget = input.target || input.filePath;
  if (!hasTarget) {
    warnings.push(
      'Recommended field "filePath" (or "target") is missing: provide the path to the ' +
        'Rust source file or project root so the skill can apply file-specific analysis'
    );
  }

  // ── Optional: edition validation ────────────────────────────────────────────
  if (input.edition !== undefined) {
    const validEditions = ['2021', '2024'];
    if (!validEditions.includes(String(input.edition))) {
      errors.push(
        `Invalid "edition" value "${input.edition}": must be one of ${validEditions.join(', ')}`
      );
    }
  }

  // ── Optional: asyncRuntime validation ───────────────────────────────────────
  if (input.asyncRuntime !== undefined) {
    const validRuntimes = ['tokio', 'async-std', 'none'];
    if (!validRuntimes.includes(input.asyncRuntime)) {
      errors.push(
        `Invalid "asyncRuntime" value "${input.asyncRuntime}": ` +
          `must be one of ${validRuntimes.join(', ')}`
      );
    }
  }

  // ── Optional: errorStrategy validation ─────────────────────────────────────
  if (input.errorStrategy !== undefined) {
    const validStrategies = ['thiserror', 'anyhow', 'custom', 'none'];
    if (!validStrategies.includes(input.errorStrategy)) {
      errors.push(
        `Invalid "errorStrategy" value "${input.errorStrategy}": ` +
          `must be one of ${validStrategies.join(', ')}`
      );
    }
  }

  // ── Warning: no error strategy specified ───────────────────────────────────
  if (!input.errorStrategy) {
    warnings.push(
      'No "errorStrategy" specified. Rust best practice: ' +
        'use "thiserror" for library crates, "anyhow" for application/binary crates. ' +
        'Specify your approach so the skill gives targeted advice.'
    );
  }

  // ── Emit ───────────────────────────────────────────────────────────────────
  if (warnings.length > 0) {
    for (const w of warnings) {
      process.stderr.write(`[rust-expert pre-execute] WARNING: ${w}\n`);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) {
      process.stderr.write(`[rust-expert pre-execute] ERROR: ${e}\n`);
    }
    return {
      continue: false,
      error: `Validation failed with ${errors.length} error(s). See stderr for details.`,
      errors,
      warnings,
    };
  }

  return { continue: true, warnings };
}

module.exports = { preExecute };
