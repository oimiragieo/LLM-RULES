/**
 * Shared parse utilities for code indexing (used by index-manager and parse-chunk-worker).
 * @module code-indexing/parse-utils
 */

'use strict';

/**
 * Build a mock parse result when tree-sitter is unavailable or parsing fails.
 * @param {string} content - File content
 * @param {string} language - Language id
 * @returns {{ content: string, language: string, rootNode: { children: object[] } }}
 */
function buildMockParseResult(content, language) {
  const lines = content.split('\n');
  const mockNodes = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const funcMatch = line.match(/function\s+(\w+)\s*\(/);
    const constFuncMatch = line.match(/const\s+(\w+)\s*=\s*function/);
    const arrowMatch = line.match(/const\s+(\w+)\s*=\s*\(/);

    if (funcMatch || constFuncMatch || arrowMatch) {
      const name = funcMatch?.[1] || constFuncMatch?.[1] || arrowMatch?.[1];
      let braceCount = 0;
      let foundOpen = false;
      let endLine = i;

      for (let j = i; j < lines.length; j++) {
        const chars = lines[j];
        for (const char of chars) {
          if (char === '{') {
            braceCount++;
            foundOpen = true;
          }
          if (char === '}') braceCount--;
          if (foundOpen && braceCount === 0) {
            endLine = j;
            break;
          }
        }
        if (foundOpen && braceCount === 0) break;
      }

      const functionContent = lines.slice(i, endLine + 1).join('\n');
      if (functionContent.trim().length > 0) {
        mockNodes.push({
          type: 'function_declaration',
          text: functionContent,
          startPosition: { row: i },
          endPosition: { row: endLine },
          children: [{ type: 'identifier', text: name || 'anonymous' }],
        });
      }
      i = endLine + 1;
    } else if (line.match(/class\s+(\w+)/)) {
      const className = line.match(/class\s+(\w+)/)?.[1];
      let braceCount = 0;
      let foundOpen = false;
      let endLine = i;

      for (let j = i; j < lines.length; j++) {
        const chars = lines[j];
        for (const char of chars) {
          if (char === '{') {
            braceCount++;
            foundOpen = true;
          }
          if (char === '}') braceCount--;
          if (foundOpen && braceCount === 0) {
            endLine = j;
            break;
          }
        }
        if (foundOpen && braceCount === 0) break;
      }

      const classContent = lines.slice(i, endLine + 1).join('\n');
      if (classContent.trim().length > 0) {
        mockNodes.push({
          type: 'class_declaration',
          text: classContent,
          startPosition: { row: i },
          endPosition: { row: endLine },
          children: [{ type: 'identifier', text: className || 'Unknown' }],
        });
      }
      i = endLine + 1;
    } else {
      i++;
    }
  }

  return {
    content,
    language,
    rootNode: { children: mockNodes },
  };
}

module.exports = { buildMockParseResult };
