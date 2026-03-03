'use strict';

/**
 * Brand Compliance Skill — Main Execution Script
 *
 * CLI entry point for brand compliance auditing.
 *
 * Usage:
 *   node .claude/skills/brand-compliance/scripts/main.cjs --action audit --content-path ./path/to/content.md
 *   node .claude/skills/brand-compliance/scripts/main.cjs --action tone-check --content-text "Your product empowers users."
 *   node .claude/skills/brand-compliance/scripts/main.cjs --action visual-audit --content-path ./design-spec.json
 *   node .claude/skills/brand-compliance/scripts/main.cjs --action cross-channel --channels web,instagram,print
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Parse command-line arguments
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key.startsWith('--')) {
      const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (value && !value.startsWith('--')) {
        args[name] = value;
        i++;
      } else {
        args[name] = true;
      }
    }
  }
  return args;
}

/**
 * Load content from file or text argument
 */
function loadContent(contentPath, contentText) {
  if (contentPath) {
    const fullPath = path.resolve(PROJECT_ROOT, contentPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Content file not found: ${fullPath}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
  }
  if (contentText) {
    return contentText;
  }
  throw new Error('Either --content-path or --content-text must be provided');
}

/**
 * Default voice profile
 */
const DEFAULT_VOICE_PROFILE = {
  formality: 3,
  warmth: 4,
  authority: 4,
  energy: 3,
};

/**
 * Simple tone dimension estimator (heuristic-based)
 * For production use, this would call an NLP service or LLM.
 */
function estimateToneDimension(text, dimension) {
  const formalMarkers = [
    'therefore',
    'furthermore',
    'consequently',
    'accordingly',
    'hereby',
    'pursuant',
  ];
  const casualMarkers = ['awesome', 'cool', 'hey', 'guys', 'totally', 'super'];
  const warmMarkers = ['you', 'your', 'we', 'our', 'together', 'help', 'support'];
  const coldMarkers = ['users', 'clients', 'parties', 'entities'];
  const authMarkers = ['must', 'will', 'proven', 'guaranteed', 'certified', 'leading'];
  const tentativeMarkers = ['might', 'could', 'possibly', 'perhaps', 'maybe'];
  const boldMarkers = ['transform', 'revolutionize', 'breakthrough', 'world-class', 'best'];
  const calmMarkers = ['steady', 'reliable', 'consistent', 'simple'];

  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const _total = words.length || 1;

  switch (dimension) {
    case 'formality': {
      const fScore = formalMarkers.filter(m => lower.includes(m)).length;
      const cScore = casualMarkers.filter(m => lower.includes(m)).length;
      return Math.max(1, Math.min(5, 3 + fScore - cScore));
    }
    case 'warmth': {
      const wScore = warmMarkers.filter(m => lower.includes(m)).length;
      const cScore = coldMarkers.filter(m => lower.includes(m)).length;
      return Math.max(1, Math.min(5, 3 + wScore - cScore));
    }
    case 'authority': {
      const aScore = authMarkers.filter(m => lower.includes(m)).length;
      const tScore = tentativeMarkers.filter(m => lower.includes(m)).length;
      return Math.max(1, Math.min(5, 3 + aScore - tScore));
    }
    case 'energy': {
      const bScore = boldMarkers.filter(m => lower.includes(m)).length;
      const cScore = calmMarkers.filter(m => lower.includes(m)).length;
      return Math.max(1, Math.min(5, 3 + bScore - cScore));
    }
    default:
      return 3;
  }
}

/**
 * Run a tone-of-voice check
 */
function runToneCheck(content, voiceProfile) {
  const profile = voiceProfile || DEFAULT_VOICE_PROFILE;
  const dimensions = ['formality', 'warmth', 'authority', 'energy'];
  const toneScore = {};
  const findings = [];

  for (const dim of dimensions) {
    const target = profile[dim] || DEFAULT_VOICE_PROFILE[dim];
    const actual = estimateToneDimension(content, dim);
    const delta = actual - target;
    const status = Math.abs(delta) <= 1 ? 'PASS' : Math.abs(delta) <= 2 ? 'WARN' : 'FAIL';
    toneScore[dim] = { target, actual, delta, status };

    if (status !== 'PASS') {
      findings.push({
        area: 'tone',
        severity: status === 'FAIL' ? 'ERROR' : 'WARNING',
        finding: `${dim} score ${actual} vs. target ${target} (delta ${delta > 0 ? '+' : ''}${delta})`,
        suggestedFix:
          delta > 0
            ? `Reduce ${dim} — use more ${dim === 'formality' ? 'conversational' : dim === 'warmth' ? 'professional' : 'tentative'} language`
            : `Increase ${dim} — add more ${dim === 'formality' ? 'formal' : dim === 'warmth' ? 'approachable' : 'confident'} phrasing`,
      });
    }
  }

  return { toneScore, findings };
}

/**
 * Run style guide validation (heuristic checks)
 */
function runStyleCheck(content) {
  const findings = [];

  // Check for common prohibited patterns
  const checks = [
    {
      pattern: /\bplease\s+do\s+not\b/i,
      suggestion: 'Use "do not" or "avoid" instead of "please do not"',
      area: 'style-guide',
    },
    {
      pattern: /\b[A-Z]{4,}\b/,
      suggestion: 'Avoid ALL-CAPS words; use bold or proper case for emphasis',
      area: 'style-guide',
    },
    {
      pattern: /!{2,}/,
      suggestion: 'Use at most one exclamation mark; multiple exclamation marks are off-brand',
      area: 'style-guide',
    },
  ];

  for (const check of checks) {
    if (check.pattern.test(content)) {
      findings.push({
        area: check.area,
        severity: 'WARNING',
        finding: `Pattern detected: ${check.pattern.toString()}`,
        suggestedFix: check.suggestion,
      });
    }
  }

  return findings;
}

/**
 * Calculate compliance score
 * Errors weighted 3x, warnings weighted 1x
 */
function calculateScore(totalChecks, errors, warnings) {
  if (totalChecks === 0) return 100;
  const penaltyPoints = errors * 3 + warnings;
  const maxPoints = totalChecks * 3;
  return Math.max(0, Math.round(((maxPoints - penaltyPoints) / maxPoints) * 100));
}

/**
 * Main audit runner
 */
function runAudit(args) {
  const { action, contentPath, contentText, outputPath } = args;
  let voiceProfile = null;

  if (args.voiceProfile) {
    try {
      voiceProfile = JSON.parse(args.voiceProfile);
    } catch {
      process.stderr.write('Warning: Could not parse --voice-profile JSON, using defaults\n');
    }
  }

  let content = '';
  try {
    content = loadContent(contentPath, contentText);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const allFindings = [];

  if (action === 'audit' || action === 'tone-check') {
    const { toneScore, findings } = runToneCheck(content, voiceProfile);
    allFindings.push(...findings.map((f, i) => ({ id: i + 1, location: 'full content', ...f })));

    const styleFindings = runStyleCheck(content);
    const offset = allFindings.length;
    allFindings.push(
      ...styleFindings.map((f, i) => ({ id: offset + i + 1, location: 'full content', ...f }))
    );

    const errors = allFindings.filter(f => f.severity === 'ERROR').length;
    const warnings = allFindings.filter(f => f.severity === 'WARNING').length;
    const totalChecks = 10; // 4 tone + 6 style checks
    const score = calculateScore(totalChecks, errors, warnings);

    const result = {
      action,
      contentRef: contentPath || '(inline text)',
      summary: {
        totalFindings: allFindings.length,
        errors,
        warnings,
        passed: totalChecks - errors - warnings,
        complianceScore: score,
      },
      findings: allFindings,
      toneScore,
    };

    const output = JSON.stringify(result, null, 2);
    if (outputPath) {
      const fullOut = path.resolve(PROJECT_ROOT, outputPath);
      fs.writeFileSync(fullOut, output, 'utf8');
      process.stdout.write(`Report written to: ${fullOut}\n`);
    } else {
      process.stdout.write(output + '\n');
    }

    return result;
  }

  process.stderr.write(
    `Action "${action}" not fully implemented in CLI mode. Use via agent context for full functionality.\n`
  );
  process.exit(1);
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  if (!args.action) {
    process.stderr.write(
      'Usage: node main.cjs --action <audit|tone-check|visual-audit|asset-check|cross-channel> [--content-path <path>] [--content-text <text>]\n'
    );
    process.exit(1);
  }
  runAudit(args);
}

module.exports = { runAudit, runToneCheck, runStyleCheck, calculateScore };
