const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function parseTools(content, agentName) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatterMatch, `${agentName} should have frontmatter`);
  const frontmatter = frontmatterMatch[1];

  const yamlListMatch = frontmatter.match(/tools:\s*\n((?:\s*-\s*[^\n]+\n?)+)/);
  if (yamlListMatch) {
    return yamlListMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('- '))
      .map(line => line.replace(/^- /, '').trim().replace(/['"]/g, ''));
  }

  const bracketMatch = frontmatter.match(/tools:\s*\[([\s\S]*?)\]/m);
  assert.ok(bracketMatch, `${agentName} should have tools array in frontmatter`);
  return bracketMatch[1]
    .split(',')
    .map(t => t.trim().replace(/['"]/g, ''))
    .filter(Boolean);
}

test('Agent Tools: code-reviewer has Write tool', () => {
  const agentPath = path.join(process.cwd(), '.claude/agents/specialized/code-reviewer.md');
  const content = fs.readFileSync(agentPath, 'utf8');
  const tools = parseTools(content, 'code-reviewer');

  assert.ok(
    tools.includes('Write'),
    `code-reviewer should have Write tool for creating reports. Current tools: ${tools.join(', ')}`
  );
});

test('Agent Tools: qa has Write tool', () => {
  const agentPath = path.join(process.cwd(), '.claude/agents/core/qa.md');
  const content = fs.readFileSync(agentPath, 'utf8');
  const tools = parseTools(content, 'qa');

  assert.ok(
    tools.includes('Write'),
    `qa should have Write tool for test reports. Current tools: ${tools.join(', ')}`
  );
});

test('Agent Tools: security-architect has WebSearch tool', () => {
  const agentPath = path.join(process.cwd(), '.claude/agents/specialized/security-architect.md');
  const content = fs.readFileSync(agentPath, 'utf8');
  const tools = parseTools(content, 'security-architect');

  assert.ok(
    tools.includes('WebSearch'),
    `security-architect should have WebSearch tool for CVE research. Current tools: ${tools.join(', ')}`
  );
});
