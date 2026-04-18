#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatAgentTypedMemorySection,
} = require('../../../.claude/lib/spawn/prompt-assembler-memory.cjs');

describe('agent-typed memory injection', () => {
  it('developer agent returns string starting with ## Memory Notes (developer)', () => {
    const section = formatAgentTypedMemorySection('developer');
    assert.ok(typeof section === 'string');
    if (section.length > 0) {
      assert.ok(
        section.startsWith('## Memory Notes (developer)'),
        `Expected section to start with '## Memory Notes (developer)', got: ${section.slice(0, 60)}`
      );
    }
    // When memory entries exist it must start with the header
    // When no entries exist the function still returns a string (may be empty if unsupported,
    // but developer IS supported so header is always present)
    assert.ok(
      section.startsWith('## Memory Notes (developer)'),
      `developer is supported — header must always appear, got: ${JSON.stringify(section.slice(0, 80))}`
    );
  });

  it('unsupported agent type returns empty string', () => {
    const section = formatAgentTypedMemorySection('nonexistent-agent-xyz');
    assert.strictEqual(section, '');
  });

  it('respects maxChars option', () => {
    const maxChars = 50;
    const section = formatAgentTypedMemorySection('developer', { maxChars });
    assert.ok(typeof section === 'string');
    // Section is header + body sliced to maxChars — total length bounded by header + maxChars
    // Header is "## Memory Notes (developer)\n" = 28 chars
    const HEADER = '## Memory Notes (developer)\n';
    assert.ok(
      section.length <= HEADER.length + maxChars,
      `section length ${section.length} exceeds header(${HEADER.length}) + maxChars(${maxChars})`
    );
  });

  it("generic agent_type 'unknown' returns empty string", () => {
    const section = formatAgentTypedMemorySection('unknown');
    assert.strictEqual(section, '');
  });
});
