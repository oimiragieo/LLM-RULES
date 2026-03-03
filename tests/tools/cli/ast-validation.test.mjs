import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateAgentInJsRouting,
  validateAgentInMarkdownTables,
} from '../../../.claude/tools/cli/validate-agent-ast.mjs';

test('AST Validation finds developer in generic Javascript', async () => {
  const jsResult = await validateAgentInJsRouting('developer');
  assert.strictEqual(
    jsResult.passed,
    true,
    'AST-grep should locate developer agent string in JS routing exports'
  );
});

test('AST Validation fails on nonexistent JS agent', async () => {
  const jsResult = await validateAgentInJsRouting('nonexistent_agent_999');
  assert.strictEqual(jsResult.passed, false, 'AST-grep should fail to find nonexistent agent');
});

test('AST Markdown parser finds developer in table cell', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-validation-'));
  const tempMd = path.join(tempDir, 'sample.md');
  fs.writeFileSync(tempMd, '| Agent |\n|---|\n| developer |\n', 'utf8');
  const mdResult = await validateAgentInMarkdownTables('developer', tempMd);
  assert.strictEqual(mdResult.passed, true, mdResult.message);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('AST Markdown parser fails on nonexistent agent in table cell', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-validation-'));
  const tempMd = path.join(tempDir, 'sample.md');
  fs.writeFileSync(tempMd, '| Agent |\n|---|\n| developer |\n', 'utf8');
  const mdResult = await validateAgentInMarkdownTables('nonexistent_markdown_agent_999', tempMd);
  assert.strictEqual(mdResult.passed, false);
  fs.rmSync(tempDir, { recursive: true, force: true });
});
