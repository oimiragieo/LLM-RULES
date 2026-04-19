'use strict';

/**
 * Mission Parser
 *
 * Parses mission.md files to extract structured sections:
 * - ## Objectives
 * - ## Anti-Goals
 * - ## Architectural Decisions
 *
 * Missing sections return empty arrays (not errors).
 * Handles malformed markdown gracefully with partial results.
 */

const fs = require('node:fs');
const path = require('node:path');

// Default empty structure returned for empty/missing files
const DEFAULT_STRUCTURE = Object.freeze({
  objectives: [],
  antiGoals: [],
  architecturalDecisions: [],
  rawContent: '',
});

/**
 * Normalize line endings (CRLF -> LF) for consistent parsing
 *
 * @param {string} content - Raw file content
 * @returns {string} - Normalized content
 */
function normalizeLineEndings(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Extract bullet points from a markdown section
 * Handles both `-` and `*` bullet styles, and nested indentation
 *
 * @param {string} content - The content to parse
 * @param {string} sectionHeader - The header to find (e.g., "## Objectives")
 * @returns {string[]} - Array of bullet point strings
 */
function extractBullets(content, sectionHeader) {
  const lines = normalizeLineEndings(content).split('\n');
  const bullets = [];

  let inTargetSection = false;
  let inCodeBlock = false;
  const headerLevel = sectionHeader.match(/^#+/)?.[0]?.length || 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Track code blocks (don't parse inside them)
    if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    // Check for section headers
    const headerMatch = trimmedLine.match(/^(#{2,6})\s+(.+)$/);

    if (headerMatch) {
      const currentLevel = headerMatch[1].length;
      const headerText = headerMatch[2].toLowerCase().trim();

      // Check if we found our target section
      if (
        headerText === sectionHeader.replace(/^#+\s*/, '').toLowerCase() ||
        headerText.includes(sectionHeader.replace(/^#+\s*/, '').toLowerCase())
      ) {
        inTargetSection = true;
        continue;
      }

      // If we hit another section at the same or higher level (smaller number = higher level)
      // we're done with our target section
      if (inTargetSection && currentLevel <= headerLevel) {
        break;
      }

      continue;
    }

    // Extract bullets if in target section
    if (inTargetSection) {
      // Match bullet points: - or * followed by content
      const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
      if (bulletMatch) {
        const indent = bulletMatch[1].length;
        const bulletText = bulletMatch[2].trim();

        // Include the bullet (handle both top-level and nested)
        if (indent === 0) {
          bullets.push(bulletText);
        } else {
          // For nested bullets, append to the last bullet or add as new
          if (bullets.length > 0) {
            bullets[bullets.length - 1] += '\n  ' + bulletText;
          } else {
            bullets.push(bulletText);
          }
        }
      }
    }
  }

  return bullets;
}

// MEv1 B4 (OWASP ASI01) — prompt-injection scanner for mission.md.
// Mirrors the Step 4 prompt-injection scan documented in the
// content-security-scan skill. Patterns are intentionally conservative
// (high-precision) to avoid blocking legitimate missions.
//   .claude/context/reports/security/mev1-phase0-threat-model-2026-04-19.md (B4)
const INJECTION_PATTERNS = [
  {
    id: 'IGNORE_PRIOR',
    re: /\b(ignore|disregard|forget)\b\s+(?:the\s+)?(?:all\s+)?(?:previous|prior|above|preceding)\s+(?:instructions|directions|prompts?|rules)\b/i,
    label: 'ignore-previous-instructions',
  },
  {
    id: 'YOU_ARE_NOW',
    re: /\byou\s+(?:are|act)\s+(?:now\s+)?(?:a|an)\s+\w+/i,
    label: 'persona-override',
  },
  {
    id: 'SYSTEM_OVERRIDE',
    re: /\b(?:system|admin|root)\s*[:>]/i,
    label: 'system-override',
  },
  {
    id: 'FAKE_LAYER',
    re: /={2,}\s*LAYER\s+\d+\s*[:=]?\s*[A-Z][^\n]*/i,
    label: 'fake-layer-delimiter',
  },
  {
    id: 'HIDDEN_HTML',
    re: /<!--[\s\S]*?\b(?:system|prompt|instruction|ignore|override)\b[\s\S]*?-->/i,
    label: 'hidden-html-instructions',
  },
  {
    id: 'JAILBREAK',
    re: /\b(?:jailbreak|DAN\s+mode|developer\s+mode\s+enabled)\b/i,
    label: 'jailbreak-pattern',
  },
];

/**
 * Scan mission content for prompt-injection patterns.
 *
 * @param {string} content
 * @returns {{ safe: boolean, findings: Array<{id:string, label:string, snippet:string}> }}
 */
function scanMissionContent(content) {
  const findings = [];
  if (typeof content !== 'string' || content.length === 0) {
    return { safe: true, findings };
  }
  for (const pattern of INJECTION_PATTERNS) {
    const m = content.match(pattern.re);
    if (m) {
      findings.push({ id: pattern.id, label: pattern.label, snippet: m[0].slice(0, 200) });
    }
  }
  return { safe: findings.length === 0, findings };
}

/**
 * Parse a mission.md file and extract structured sections.
 *
 * @param {string} missionPath - Path to the mission.md file
 * @param {object} [opts]
 * @param {boolean} [opts.strict] - When true, throws MISSION_INJECTION_DETECTED
 *   if `scanMissionContent` flags the file. Default false (parse-only) so
 *   existing call sites remain backward-compatible; orchestrator should pass
 *   `strict: true` at load time per B4.
 * @returns {Object} - { objectives, antiGoals, architecturalDecisions, rawContent, scan }
 */
function parseMission(missionPath, opts = {}) {
  // Normalize the path
  const normalizedPath = path.normalize(missionPath);

  // Check if file exists
  if (!fs.existsSync(normalizedPath)) {
    // Return default structure for non-existent file
    return { ...DEFAULT_STRUCTURE };
  }

  // Read file content
  let content;
  try {
    content = fs.readFileSync(normalizedPath, 'utf8');
  } catch (_readErr) {
    // Return default structure on read error
    return { ...DEFAULT_STRUCTURE };
  }

  // Handle empty file
  if (!content || content.trim() === '') {
    return { ...DEFAULT_STRUCTURE };
  }

  // MEv1 B4: scan for prompt-injection patterns. Always runs; in strict
  // mode throws so the orchestrator refuses to load a poisoned mission.
  const scan = scanMissionContent(content);
  if (opts.strict && !scan.safe) {
    const err = new Error(
      `mission.md prompt-injection detected: ${scan.findings.map(f => f.label).join(', ')}`
    );
    err.code = 'MISSION_INJECTION_DETECTED';
    err.findings = scan.findings;
    throw err;
  }

  // Extract sections
  const objectives = extractBullets(content, '## Objectives');
  const antiGoals = extractBullets(content, '## Anti-Goals');
  const architecturalDecisions = extractBullets(content, '## Architectural Decisions');

  return {
    objectives,
    antiGoals,
    architecturalDecisions,
    rawContent: content,
    scan,
  };
}

/**
 * Inject mission context into a worker prompt
 * Appends a ## Mission Context section with objectives, anti-goals, and decisions
 *
 * @param {string} prompt - Original worker prompt
 * @param {Object} parsed - Parsed mission data from parseMission()
 * @returns {string} - Enhanced prompt with mission context
 */
function injectMissionContext(prompt, parsed) {
  const sections = [];

  // Start with Mission Context header
  sections.push('## Mission Context');
  sections.push('');

  // Add objectives
  if (parsed.objectives && parsed.objectives.length > 0) {
    sections.push('### Objectives');
    for (const obj of parsed.objectives) {
      sections.push(`- ${obj}`);
    }
    sections.push('');
  } else {
    sections.push('[WARNING] No objectives found in mission.md');
    sections.push('');
  }

  // Add anti-goals if present
  if (parsed.antiGoals && parsed.antiGoals.length > 0) {
    sections.push('### Anti-Goals');
    sections.push('_Avoid these outcomes:_');
    for (const ag of parsed.antiGoals) {
      sections.push(`- ${ag}`);
    }
    sections.push('');
  }

  // Add architectural decisions if present
  if (parsed.architecturalDecisions && parsed.architecturalDecisions.length > 0) {
    sections.push('### Architectural Decisions');
    for (const ad of parsed.architecturalDecisions) {
      sections.push(`- ${ad}`);
    }
    sections.push('');
  }

  // Combine original prompt with mission context
  return prompt + '\n\n' + sections.join('\n');
}

module.exports = {
  parseMission,
  injectMissionContext,
  extractBullets,
  scanMissionContent,
  INJECTION_PATTERNS,
  DEFAULT_STRUCTURE,
};
