#!/usr/bin/env node
'use strict';

/**
 * Three-Level Summarization Tiers (Feature D4)
 * =============================================
 * Provides escalating compression strategies based on context pressure:
 * - Normal (60-70%): Keep signatures, summarize implementations
 * - Aggressive (80-90%): Keep only function names and key decisions
 * - Truncation (90-95%): Keep only file paths and one-line summaries
 *
 * Usage:
 *   const { selectTier, summarize, TIERS } = require('./summarization-tiers.cjs');
 *
 *   const tier = selectTier(currentTokens, maxTokens);
 *   const result = summarize(content, tier);
 */

/**
 * @typedef {'normal'|'aggressive'|'truncation'} SummarizationTier
 */

const TIERS = {
  normal: {
    name: 'normal',
    reductionTarget: 0.65, // 60-70% reduction
    thresholdPct: 0.5, // Activate when context is 50%+ full
    strategy: 'Keep function signatures, summarize implementations, preserve decisions',
  },
  aggressive: {
    name: 'aggressive',
    reductionTarget: 0.85, // 80-90% reduction
    thresholdPct: 0.7, // Activate when context is 70%+ full
    strategy: 'Keep only function names and key decisions, drop all implementations',
  },
  truncation: {
    name: 'truncation',
    reductionTarget: 0.92, // 90-95% reduction
    thresholdPct: 0.85, // Activate when context is 85%+ full
    strategy: 'Keep only file paths and one-line summaries per file',
  },
};

/**
 * Select the appropriate summarization tier based on context pressure.
 * @param {number} currentTokens - Current token count
 * @param {number} maxTokens - Maximum token budget
 * @returns {SummarizationTier}
 */
function selectTier(currentTokens, maxTokens) {
  if (maxTokens <= 0) return 'normal';
  const ratio = currentTokens / maxTokens;

  if (ratio >= TIERS.truncation.thresholdPct) return 'truncation';
  if (ratio >= TIERS.aggressive.thresholdPct) return 'aggressive';
  if (ratio >= TIERS.normal.thresholdPct) return 'normal';

  return 'normal'; // Below threshold — use normal as minimum
}

/**
 * Summarize content according to the selected tier.
 * @param {string} content - Raw content to summarize
 * @param {SummarizationTier} tier - Compression tier
 * @param {Object} [options]
 * @param {string} [options.filePath] - Source file path for context
 * @param {string} [options.contentType] - 'code'|'conversation'|'documentation'|'logs'
 * @returns {{ summary: string, tier: SummarizationTier, originalLength: number, summaryLength: number, reductionPct: number }}
 */
function summarize(content, tier, options = {}) {
  if (!content || typeof content !== 'string') {
    return {
      summary: '',
      tier,
      originalLength: 0,
      summaryLength: 0,
      reductionPct: 0,
    };
  }

  const originalLength = content.length;
  const contentType = options.contentType || detectContentType(content);
  let summary;

  switch (tier) {
    case 'truncation':
      summary = summarizeTruncation(content, contentType, options);
      break;
    case 'aggressive':
      summary = summarizeAggressive(content, contentType, options);
      break;
    case 'normal':
    default:
      summary = summarizeNormal(content, contentType, options);
      break;
  }

  return {
    summary,
    tier,
    originalLength,
    summaryLength: summary.length,
    reductionPct:
      originalLength > 0
        ? Math.round(((originalLength - summary.length) / originalLength) * 100)
        : 0,
  };
}

/**
 * Detect content type from content analysis.
 * @param {string} content
 * @returns {'code'|'conversation'|'documentation'|'logs'}
 */
function detectContentType(content) {
  const lines = content.split('\n').slice(0, 20);
  const sample = lines.join('\n');

  if (/^(import|const|function|class|module\.exports|require\()/m.test(sample)) return 'code';
  if (/^(#+\s|\*\*|---)/m.test(sample)) return 'documentation';
  if (/^\d{4}-\d{2}-\d{2}|^\[INFO\]|^\[ERROR\]|^{.*"timestamp"/m.test(sample)) return 'logs';
  if (/^(User:|Assistant:|Human:)/m.test(sample)) return 'conversation';

  return 'documentation';
}

/**
 * Normal tier: Keep signatures, summarize implementations.
 */
function summarizeNormal(content, contentType, options) {
  const lines = content.split('\n');

  if (contentType === 'code') {
    return summarizeCodeNormal(lines, options);
  }
  if (contentType === 'logs') {
    return summarizeLogsNormal(lines);
  }
  if (contentType === 'conversation') {
    return summarizeConversationNormal(lines);
  }
  // documentation
  return summarizeDocsNormal(lines);
}

/**
 * Aggressive tier: Function names and key decisions only.
 */
function summarizeAggressive(content, contentType, options) {
  const lines = content.split('\n');

  if (contentType === 'code') {
    return summarizeCodeAggressive(lines, options);
  }
  if (contentType === 'logs') {
    return summarizeLogsAggressive(lines);
  }
  // conversation + documentation
  return summarizeDocsAggressive(lines);
}

/**
 * Truncation tier: File paths and one-line summaries.
 */
function summarizeTruncation(content, contentType, options) {
  const lines = content.split('\n');
  const filePath = options.filePath || 'unknown';
  const lineCount = lines.length;

  if (contentType === 'code') {
    const functions = lines
      .filter((l) => /^(function|const\s+\w+\s*=|class\s+|module\.exports)/.test(l.trim()))
      .map((l) => l.trim().substring(0, 60))
      .slice(0, 10);
    return `[${filePath}] ${lineCount} lines, ${functions.length} exports: ${functions.join('; ')}`;
  }

  if (contentType === 'logs') {
    const errorCount = lines.filter((l) => /error|fatal|critical/i.test(l)).length;
    const warnCount = lines.filter((l) => /warn/i.test(l)).length;
    return `[${filePath}] ${lineCount} log lines, ${errorCount} errors, ${warnCount} warnings`;
  }

  // documentation/conversation
  const headings = lines
    .filter((l) => /^#{1,3}\s/.test(l))
    .map((l) => l.replace(/^#+\s*/, ''))
    .slice(0, 8);
  return `[${filePath}] ${lineCount} lines, sections: ${headings.join(', ') || 'none'}`;
}

// --- Code summarization helpers ---

function summarizeCodeNormal(lines, options) {
  const result = [];
  const filePath = options.filePath;
  if (filePath) result.push(`// File: ${filePath}`);

  let inFunction = false;
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Keep imports, exports, function signatures, class declarations
    if (/^(import|const\s+{|require\(|module\.exports|'use strict')/.test(trimmed)) {
      result.push(line);
      continue;
    }
    if (/^(function\s|async\s+function|class\s|const\s+\w+\s*=\s*(async\s+)?\()/.test(trimmed)) {
      result.push(line);
      inFunction = true;
      braceDepth = 0;
      continue;
    }
    if (/^(\/\*\*|\/\/\s*(TODO|FIXME|HACK|NOTE))/.test(trimmed)) {
      result.push(line);
      continue;
    }

    // Track brace depth to skip function bodies
    if (inFunction) {
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        result.push('  // ... implementation ...');
        result.push(line); // closing brace
        inFunction = false;
      }
    }
  }

  return result.join('\n');
}

function summarizeCodeAggressive(lines, options) {
  const result = [];
  const filePath = options.filePath;
  if (filePath) result.push(`// ${filePath}`);

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(module\.exports|exports\.)/.test(trimmed)) {
      result.push(trimmed);
    } else if (/^(function\s|async\s+function|class\s)/.test(trimmed)) {
      result.push(trimmed.replace(/{.*/, '{ ... }'));
    }
  }

  return result.join('\n') || `// ${lines.length} lines of code`;
}

// --- Log summarization helpers ---

function summarizeLogsNormal(lines) {
  const errors = lines.filter((l) => /error|fatal|critical/i.test(l));
  const warnings = lines.filter((l) => /warn/i.test(l));
  const unique = [...new Set(errors.map((l) => l.substring(0, 120)))].slice(0, 10);

  const result = [`// ${lines.length} log lines total`];
  if (unique.length > 0) {
    result.push(`// ${errors.length} errors (${unique.length} unique):`);
    unique.forEach((e) => result.push(`  ${e}`));
  }
  if (warnings.length > 0) {
    result.push(`// ${warnings.length} warnings`);
  }
  return result.join('\n');
}

function summarizeLogsAggressive(lines) {
  const errorCount = lines.filter((l) => /error|fatal|critical/i.test(l)).length;
  const warnCount = lines.filter((l) => /warn/i.test(l)).length;
  return `${lines.length} lines: ${errorCount} errors, ${warnCount} warnings`;
}

// --- Conversation/Docs helpers ---

function summarizeConversationNormal(lines) {
  const decisions = [];
  const questions = [];

  for (const line of lines) {
    if (/\bdecid|chose|decision|agreed|let'?s\s+use\b/i.test(line)) {
      decisions.push(line.trim().substring(0, 120));
    }
    if (/\?$/.test(line.trim())) {
      questions.push(line.trim().substring(0, 120));
    }
  }

  const result = [`// ${lines.length} conversation lines`];
  if (decisions.length > 0) {
    result.push(`// Decisions (${decisions.length}):`);
    decisions.slice(0, 5).forEach((d) => result.push(`  - ${d}`));
  }
  if (questions.length > 0) {
    result.push(`// Questions (${questions.length}):`);
    questions.slice(0, 3).forEach((q) => result.push(`  - ${q}`));
  }
  return result.join('\n');
}

function summarizeDocsNormal(lines) {
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,4}\s/.test(trimmed) || /^\*\*[^*]+\*\*/.test(trimmed)) {
      result.push(line);
    } else if (/^-\s/.test(trimmed) && trimmed.length < 100) {
      result.push(line);
    }
  }
  return result.join('\n') || `// ${lines.length} lines of documentation`;
}

function summarizeDocsAggressive(lines) {
  const headings = lines
    .filter((l) => /^#{1,3}\s/.test(l.trim()))
    .map((l) => l.trim());
  return headings.join('\n') || `// ${lines.length} lines`;
}

module.exports = {
  TIERS,
  selectTier,
  summarize,
  detectContentType,
};
