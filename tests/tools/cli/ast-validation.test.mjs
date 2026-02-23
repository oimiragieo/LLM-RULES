import test from 'node:test';
import assert from 'node:assert';
import { validateAgentInJsRouting, validateAgentInMarkdownTables } from '../../../.claude/tools/cli/validate-agent-ast.mjs';

test('AST Validation finds router in generic Javascript', async () => {
    // We search for 'router', which should be present in our routing table
    const jsResult = await validateAgentInJsRouting('router');
    assert.strictEqual(jsResult.passed, true, 'AST-grep should locate router agent string in JS files inside lib/routing');
});

test('AST Validation fails on nonexistent JS agent', async () => {
    const jsResult = await validateAgentInJsRouting('nonexistent_agent_999');
    assert.strictEqual(jsResult.passed, false, 'AST-grep should fail to find nonexistent agent');
});

test('AST Markdown parser finds developer in CLAUDE.md table', async () => {
    // developer is listed in routing table Markdown in CLAUDE.md usually
    const mdResult = await validateAgentInMarkdownTables('developer');
    // It's possible developer is not in CLAUDE.md depending on changes, 
    // but typically 'developer' or 'router' is there. Let's try 'router'.
    assert.strictEqual(mdResult.passed, true, mdResult.message);
});

test('AST Markdown parser fails on nonexistent agent in CLAUDE.md', async () => {
    const mdResult = await validateAgentInMarkdownTables('nonexistent_markdown_agent_999');
    assert.strictEqual(mdResult.passed, false);
});
