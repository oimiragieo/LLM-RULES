#!/usr/bin/env node
'use strict';

/**
 * Edge Case Hunter (Feature C3)
 * ==============================
 * Structured edge case detection with categorized output.
 * Analyzes code for boundary conditions, null/undefined handling,
 * type coercion risks, and concurrency hazards.
 *
 * Usage:
 *   const { huntEdgeCases, EDGE_CASE_CATEGORIES } = require('./edge-case-hunter.cjs');
 *
 *   const findings = huntEdgeCases(codeContent, { filePath: 'src/auth.js' });
 */

const EDGE_CASE_CATEGORIES = {
  boundary: {
    name: 'Boundary Conditions',
    patterns: [
      { regex: /\.length\s*[><=]=?\s*0/g, description: 'Array/string length check — verify empty case handled' },
      { regex: /\[\s*0\s*\]/g, description: 'First element access — verify non-empty array' },
      { regex: /\.slice\(/g, description: 'Slice operation — verify start/end bounds' },
      { regex: /parseInt|parseFloat|Number\(/g, description: 'Number parsing — verify NaN/Infinity handling' },
      { regex: /Math\.(max|min|floor|ceil|round)/g, description: 'Math operation — verify extreme values' },
    ],
  },
  nullability: {
    name: 'Null/Undefined Handling',
    patterns: [
      { regex: /\w+\.\w+\.\w+/g, description: 'Deep property access — verify intermediate nulls' },
      { regex: /(?<!\?)\.\w+\(/g, description: 'Method call without optional chaining — may throw on null' },
      { regex: /JSON\.parse\(/g, description: 'JSON.parse without try/catch — throws on invalid input' },
      { regex: /\.split\(/g, description: 'String.split — verify non-null input' },
    ],
  },
  typeCoercion: {
    name: 'Type Coercion Risks',
    patterns: [
      { regex: /==(?!=)/g, description: 'Loose equality — may coerce types unexpectedly' },
      { regex: /!=(?!=)/g, description: 'Loose inequality — may coerce types unexpectedly' },
      { regex: /\+\s*['"`]/g, description: 'String concatenation with + — may coerce numbers' },
    ],
  },
  concurrency: {
    name: 'Concurrency Hazards',
    patterns: [
      { regex: /\.forEach\(.*await/g, description: 'await inside forEach — does not work as expected' },
      { regex: /setTimeout\(.*,\s*0\)/g, description: 'setTimeout(fn, 0) — execution order not guaranteed' },
      { regex: /fs\.\w+Sync\(/g, description: 'Sync file I/O — blocks event loop' },
    ],
  },
  security: {
    name: 'Security Edge Cases',
    patterns: [
      { regex: /\bev[a]l\s*\(/g, description: 'Dynamic code execution — code injection risk' },
      { regex: /innerHTML|outerHTML/g, description: 'innerHTML — XSS risk if user input' },
      { regex: /shell:\s*true/g, description: 'shell: true — command injection risk' },
      { regex: /__proto__|constructor\.prototype/g, description: 'Prototype access — pollution risk' },
    ],
  },
};

/**
 * @typedef {Object} EdgeCaseFinding
 * @property {string} id
 * @property {string} category
 * @property {string} description
 * @property {string} file
 * @property {number} line
 * @property {string} match - Matched text
 * @property {'low'|'medium'|'high'} risk
 */

/**
 * Hunt for edge cases in code content.
 * @param {string} content - Source code
 * @param {Object} [options]
 * @param {string} [options.filePath='unknown']
 * @param {string[]} [options.categories] - Specific categories to check (default: all)
 * @returns {EdgeCaseFinding[]}
 */
function huntEdgeCases(content, options = {}) {
  const filePath = options.filePath || 'unknown';
  const categories = options.categories || Object.keys(EDGE_CASE_CATEGORIES);
  const findings = [];
  const lines = content.split('\n');
  let findingId = 0;

  for (const catKey of categories) {
    const category = EDGE_CASE_CATEGORIES[catKey];
    if (!category) continue;

    for (const pattern of category.patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Reset regex lastIndex
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(line);
        if (match) {
          findingId++;
          findings.push({
            id: `EC-${String(findingId).padStart(3, '0')}`,
            category: catKey,
            description: pattern.description,
            file: filePath,
            line: i + 1,
            match: match[0],
            risk: categorizeRisk(catKey),
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Map category to risk level.
 * @param {string} category
 * @returns {'low'|'medium'|'high'}
 */
function categorizeRisk(category) {
  const riskMap = {
    boundary: 'medium',
    nullability: 'medium',
    typeCoercion: 'low',
    concurrency: 'high',
    security: 'high',
  };
  return riskMap[category] || 'medium';
}

/**
 * Get a summary of findings by category.
 * @param {EdgeCaseFinding[]} findings
 * @returns {Record<string, number>}
 */
function summarizeFindings(findings) {
  const summary = {};
  for (const f of findings) {
    summary[f.category] = (summary[f.category] || 0) + 1;
  }
  return summary;
}

module.exports = {
  huntEdgeCases,
  summarizeFindings,
  EDGE_CASE_CATEGORIES,
};
