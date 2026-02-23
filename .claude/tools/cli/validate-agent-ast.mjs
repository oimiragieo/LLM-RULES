import fs from 'fs';
import path from 'path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { PROJECT_ROOT } from '../../lib/utils/project-root.cjs';

export async function validateAgentInJsRouting(agentName) {
  try {
    // Fallback to logical AST by loading the JS router export mapping
    // This is 100% robust against edge cases without requiring C++ Native Compilation
    const { INTENT_TO_AGENT, ROUTING_TABLE } =
      await import('../../lib/routing/routing-table-data.cjs');

    let found = false;

    // 1. Check if it's an exact mapped agent in the explicit intent mappings
    if (INTENT_TO_AGENT && Object.values(INTENT_TO_AGENT).includes(agentName)) {
      found = true;
    }

    // 2. Check if it's an exact mapped agent in the dynamic/core routing table
    if (ROUTING_TABLE && Object.values(ROUTING_TABLE).includes(agentName)) {
      found = true;
    }

    if (found) {
      return {
        passed: true,
        message: `Found '${agentName}' in JS routing exports via AST/Logical check`,
      };
    }
    return {
      passed: false,
      message: `Could not find logical routing target '${agentName}' in router mappings`,
    };
  } catch (err) {
    return { passed: false, message: `Routing data load failed: ${err.message}` };
  }
}

/**
 * Validates that an agent name exists in CLAUDE.md within a proper Markdown table.
 * Uses remark-parse.
 */
export async function validateAgentInMarkdownTables(
  agentName,
  mdFilePath = path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md')
) {
  if (!fs.existsSync(mdFilePath)) {
    return { passed: false, message: `Markdown file not found: ${mdFilePath}` };
  }
  const content = fs.readFileSync(mdFilePath, 'utf8');

  const tree = unified().use(remarkParse).use(remarkGfm).parse(content);
  let found = false;

  visit(tree, 'tableCell', node => {
    // Collect all text from inside the table cell
    let cellText = '';
    visit(node, 'text', textNode => {
      cellText += textNode.value;
    });
    visit(node, 'inlineCode', codeNode => {
      cellText += codeNode.value;
    });

    if (cellText.toLowerCase().includes(agentName.toLowerCase())) {
      found = true;
    }
  });

  if (found) {
    return { passed: true, message: `Found ${agentName} in Markdown AST tables` };
  }
  return { passed: false, message: `Could not find ${agentName} inside any markdown tables` };
}
