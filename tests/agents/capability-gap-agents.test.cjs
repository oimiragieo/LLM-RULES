'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseFrontmatter,
  validateAgentFile,
} = require('../../.claude/lib/agents/agent-template-contract.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const agentConfig = require('../../.claude/config/agent-config.json');

for (const agentPath of [
  '.claude/agents/specialized/telegram-channel-agent.md',
  '.claude/agents/specialized/cron-scheduler-agent.md',
]) {
  const fullPath = path.join(PROJECT_ROOT, agentPath);
  const agentId = path.basename(agentPath, '.md');

  test(`${agentPath} exists and satisfies the agent template contract`, () => {
    const result = validateAgentFile(fullPath);
    assert.deepEqual(result.errors, []);
  });

  test(`${agentId} frontmatter tools match agent-config.json`, () => {
    const content = fs.readFileSync(fullPath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    assert.ok(frontmatter, `${agentId} must have YAML frontmatter`);
    assert.deepEqual(
      [...frontmatter.tools].sort(),
      [...agentConfig.agents[agentId].tools].sort(),
      `${agentId} frontmatter tools must match generated config tools`
    );
  });
}
