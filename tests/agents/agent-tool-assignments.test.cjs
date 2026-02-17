const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Agent Tools: code-reviewer has Write tool', () => {
  const agentPath = path.join(process.cwd(), '.claude/agents/specialized/code-reviewer.md');
  const content = fs.readFileSync(agentPath, 'utf8');

  // Extract frontmatter tools
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatterMatch, 'code-reviewer should have frontmatter');

  const frontmatter = frontmatterMatch[1];
  const toolsMatch = frontmatter.match(/tools:\s*\[(.*?)\]/);

  assert.ok(toolsMatch, 'code-reviewer should have tools array in frontmatter');

  const tools = toolsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));

  assert.ok(
    tools.includes('Write'),
    `code-reviewer should have Write tool for creating reports. Current tools: ${tools.join(', ')}`
  );
});

test('Agent Tools: qa has Write tool', () => {
  const agentPath = path.join(process.cwd(), '.claude/agents/core/qa.md');
  const content = fs.readFileSync(agentPath, 'utf8');

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatterMatch, 'qa should have frontmatter');

  const frontmatter = frontmatterMatch[1];
  const toolsMatch = frontmatter.match(/tools:\s*\[(.*?)\]/);

  assert.ok(toolsMatch, 'qa should have tools array in frontmatter');

  const tools = toolsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));

  assert.ok(
    tools.includes('Write'),
    `qa should have Write tool for test reports. Current tools: ${tools.join(', ')}`
  );
});

test('Agent Tools: security-architect has WebSearch tool', () => {
  const agentPath = path.join(process.cwd(), '.claude/agents/core/security-architect.md');
  const content = fs.readFileSync(agentPath, 'utf8');

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatterMatch, 'security-architect should have frontmatter');

  const frontmatter = frontmatterMatch[1];
  const toolsMatch = frontmatter.match(/tools:\s*\[(.*?)\]/);

  assert.ok(toolsMatch, 'security-architect should have tools array in frontmatter');

  const tools = toolsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));

  assert.ok(
    tools.includes('WebSearch'),
    `security-architect should have WebSearch tool for CVE research. Current tools: ${tools.join(', ')}`
  );
});
