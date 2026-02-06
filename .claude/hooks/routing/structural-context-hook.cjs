#!/usr/bin/env node
/**
 * Structural Context Hook - Pre-Prompt
 * 
 * Analyzes codebase structure on each prompt using ripgrep.
 * Injects mermaid diagram and relevant files into agent context.
 * 
 * Time: ~0.5s for 40k files
 */

'use strict';

const { HybridLazyIndexer } = require('../../lib/code-indexing/hybrid-lazy-indexer.cjs');
const { parseHookInputAsync, getToolInput } = require('../../lib/utils/hook-input.cjs');

async function main() {
  try {
    // Get the user's prompt
    const hookInput = await parseHookInputAsync();
    const toolInput = getToolInput(hookInput);
    const userPrompt = toolInput?.prompt || '';
    
    // Skip if no prompt
    if (!userPrompt) {
      process.exit(0);
    }
    
    const indexer = new HybridLazyIndexer({
      embeddingEnabled: false, // ripgrep only for speed
    });
    
    // Analyze structure
    const startTime = Date.now();
    const [structure, searchResults] = await Promise.all([
      indexer.analyzeStructure(),
      // Only search if prompt looks like code search
      looksLikeCodeQuery(userPrompt) 
        ? indexer.ripgrepSearch(userPrompt, { limit: 10 })
        : Promise.resolve([]),
    ]);
    
    // Format context for agent
    const context = formatContext(structure, searchResults, userPrompt);
    
    // Output to stdout (Claude Code captures this)
    console.log(context);
    
    // Log timing
    console.error(`[structural-context] Analyzed in ${Date.now() - startTime}ms`);
    
    process.exit(0);
  } catch (err) {
    console.error('[structural-context] Error:', err.message);
    // Fail open - don't block prompt
    process.exit(0);
  }
}

function looksLikeCodeQuery(prompt) {
  // Heuristic: Does this look like a code search?
  const codeKeywords = /\b(function|class|import|export|const|let|var|async|await|component|interface|type)\b/i;
  const filePatterns = /\.(js|ts|jsx|tsx|py|go|rs|java)\b/;
  const searchTerms = prompt.length > 10 && !prompt.match(/\b(hello|hi|how are you|what is|explain)\b/i);
  
  return codeKeywords.test(prompt) || filePatterns.test(prompt) || searchTerms;
}

function formatContext(structure, searchResults, prompt) {
  const lines = [
    '<!-- STRUCTURAL_CONTEXT_START -->',
    '',
    '## 📁 Project Structure (Live Analysis)',
    '',
    '### Directory Overview',
    '```',
    truncate(structure.tree, 50),
    '```',
    '',
    '### Entry Points (Public API)',
  ];
  
  structure.entryPoints.slice(0, 10).forEach(ep => {
    const code = ep.code.replace(/\s+/g, ' ').slice(0, 60);
    lines.push(`- \`${ep.file}:${ep.line}\` - ${code}`);
  });
  
  lines.push('');
  lines.push('### Dependency Map');
  structure.dependencies.slice(0, 8).forEach(([dep, count]) => {
    lines.push(`- ${dep}: ${count} imports`);
  });
  
  if (searchResults.length > 0) {
    lines.push('');
    lines.push(`### 🔍 Relevant Files for "${prompt.slice(0, 40)}..."`);
    lines.push('(Based on ripgrep text search)');
    searchResults.slice(0, 8).forEach(r => {
      lines.push(`- ${r.file}`);
      if (r.matches) {
        r.matches.slice(0, 2).forEach(m => {
          lines.push(`  - Line ${m.line}: ${m.text.slice(0, 60)}`);
        });
      }
    });
  }
  
  lines.push('');
  lines.push('### 📊 Architecture Diagram');
  lines.push('```mermaid');
  lines.push(structure.diagram);
  lines.push('```');
  lines.push('');
  lines.push('<!-- STRUCTURAL_CONTEXT_END -->');
  lines.push('');
  
  return lines.join('\n');
}

function truncate(str, lines) {
  return str.split('\n').slice(0, lines).join('\n') + '\n...';
}

if (require.main === module) {
  main();
}

module.exports = { main, looksLikeCodeQuery, formatContext };
