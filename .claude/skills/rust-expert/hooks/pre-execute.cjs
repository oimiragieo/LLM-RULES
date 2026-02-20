'use strict';

/**
 * rust-expert pre-execute hook
 *
 * Validates that the skill input contains the required fields before
 * the Rust expert workflow begins. Emits warnings for missing optional
 * but recommended fields.
 */

function validateOneOf(input, key, validList, errors) {
  const value = input[key];
  if (value === undefined) return;
  const list = validList.map(String);
  const strVal = String(value);
  if (!list.includes(strVal)) {
    errors.push(`Invalid "${key}" value "${value}": must be one of ${list.join(', ')}`);
  }
}

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

  validateOneOf(input, 'edition', ['2021', '2024'], errors);
  validateOneOf(input, 'asyncRuntime', ['tokio', 'async-std', 'none'], errors);
  validateOneOf(input, 'errorStrategy', ['thiserror', 'anyhow', 'custom', 'none'], errors);

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
