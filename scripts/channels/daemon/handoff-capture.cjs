/**
 * handoff-capture.cjs — Structured output parser for mission-aware task execution
 *
 * Parses headless Claude output for Factory Droid-aligned handoff data.
 * Falls back to unstructured summary when no handoff block is found.
 * Provides lightweight grading against basic alignment rules.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Parse a headless Claude output for structured handoff data.
 * Looks for a fenced JSON block tagged with ```handoff or ```json containing handoff fields.
 *
 * @param {string} rawOutput - Raw text output from headless Claude session
 * @returns {{ structured: boolean, handoff: object }}
 */
function parseHandoff(rawOutput) {
  if (!rawOutput || typeof rawOutput !== 'string') {
    return { structured: false, handoff: { summary: 'No output produced.' } };
  }

  // Try to find a fenced handoff block: ```handoff or ```json with handoff fields
  const fencePatterns = [
    /```handoff\s*\n([\s\S]*?)\n```/,
    /```json\s*\n(\{[\s\S]*?"commandsRun"[\s\S]*?\})\s*\n```/,
    /```json\s*\n(\{[\s\S]*?"filesModified"[\s\S]*?\})\s*\n```/,
  ];

  for (const pattern of fencePatterns) {
    const match = rawOutput.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        return { structured: true, handoff: normalizeHandoff(parsed) };
      } catch {
        // JSON parse failed — continue to next pattern
      }
    }
  }

  // Fallback: extract what we can from unstructured output
  return { structured: false, handoff: extractUnstructured(rawOutput) };
}

/**
 * Normalize a parsed handoff to ensure all expected fields exist.
 *
 * @param {object} raw - Parsed JSON from handoff block
 * @returns {object} Normalized handoff
 */
function normalizeHandoff(raw) {
  return {
    summary: raw.summary || raw.salientSummary || '',
    filesModified: raw.filesModified || [],
    commandsRun: (raw.commandsRun || []).map(c => ({
      command: c.command || c.cmd || '',
      exitCode: typeof c.exitCode === 'number' ? c.exitCode : null,
      observation: c.observation || c.result || '',
    })),
    discoveredIssues: (raw.discoveredIssues || []).map(i => ({
      severity: i.severity || 'info',
      description: i.description || i.issue || '',
      suggestedFix: i.suggestedFix || '',
    })),
    skillFeedback: {
      followedProcedure: raw.skillFeedback?.followedProcedure ?? true,
      deviations: raw.skillFeedback?.deviations || [],
      suggestedChanges: raw.skillFeedback?.suggestedChanges || [],
    },
    testsAdded: raw.testsAdded || [],
    testsCoverage: raw.testsCoverage || '',
  };
}

/**
 * Extract whatever we can from unstructured output.
 *
 * @param {string} text - Raw output text
 * @returns {object} Best-effort handoff
 */
function extractUnstructured(text) {
  const lines = text.split('\n');

  // Try to find file paths mentioned
  const filePattern = /(?:^|\s)([\w./-]+\.(?:cjs|mjs|js|ts|tsx|jsx|py|rs|go|json|md))\b/g;
  const filesModified = [];
  let match;
  while ((match = filePattern.exec(text)) !== null) {
    if (!filesModified.includes(match[1])) filesModified.push(match[1]);
  }

  // Try to find test results
  const commandsRun = [];
  const testPassMatch = text.match(/(\d+)\s+(?:tests?\s+)?pass/i);
  const testFailMatch = text.match(/(\d+)\s+fail/i);
  if (testPassMatch || testFailMatch) {
    commandsRun.push({
      command: 'tests',
      exitCode: testFailMatch && parseInt(testFailMatch[1], 10) > 0 ? 1 : 0,
      observation: `${testPassMatch ? testPassMatch[0] : ''} ${testFailMatch ? testFailMatch[0] : ''}`.trim(),
    });
  }

  // Use first 500 chars as summary
  const summary = lines
    .filter(l => l.trim() && !l.startsWith('```'))
    .slice(0, 5)
    .join(' ')
    .slice(0, 500);

  return {
    summary,
    filesModified: filesModified.slice(0, 20),
    commandsRun,
    discoveredIssues: [],
    skillFeedback: { followedProcedure: true, deviations: [], suggestedChanges: [] },
    testsAdded: [],
    testsCoverage: '',
  };
}

/**
 * Write a handoff document to the channel handoffs directory.
 *
 * @param {string} handoffsDir - Directory to write handoff JSON
 * @param {object} handoffData - Handoff data to write
 * @param {object} featureSpec - Feature spec that was executed
 * @returns {string} Path to written handoff file
 */
function writeHandoff(handoffsDir, handoffData, featureSpec) {
  if (!fs.existsSync(handoffsDir)) {
    fs.mkdirSync(handoffsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const featureSlug = (featureSpec.id || 'unknown').replace(/[^a-z0-9-]/g, '-');
  const filename = `${timestamp}__${featureSlug}.json`;
  const filePath = path.join(handoffsDir, filename);

  const document = {
    timestamp: new Date().toISOString(),
    featureId: featureSpec.id || 'ad-hoc',
    milestone: featureSpec.milestone || 'telegram',
    successState: determineSuccessState(handoffData),
    returnToOrchestrator: false,
    handoff: {
      salientSummary: handoffData.summary || '',
      whatWasImplemented: handoffData.summary || '',
      whatWasLeftUndone: '',
      verification: {
        commandsRun: handoffData.commandsRun || [],
      },
      tests: {
        added: handoffData.testsAdded || [],
        coverage: handoffData.testsCoverage || '',
      },
      discoveredIssues: handoffData.discoveredIssues || [],
      skillFeedback: handoffData.skillFeedback || {
        followedProcedure: true,
        deviations: [],
      },
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(document, null, 2) + '\n', 'utf8');
  return filePath;
}

/**
 * Determine success state from handoff data.
 *
 * @param {object} handoff - Handoff data
 * @returns {'success' | 'failure' | 'partial'}
 */
function determineSuccessState(handoff) {
  const hasBlockers = (handoff.discoveredIssues || []).some(i => i.severity === 'blocking');
  if (hasBlockers) return 'failure';

  const commands = handoff.commandsRun || [];
  const hasFailures = commands.some(c => c.exitCode !== null && c.exitCode !== 0);
  if (hasFailures) return 'partial';

  return 'success';
}

/**
 * Grade a handoff against basic alignment rules.
 * Lightweight version of mission-grader — scores 0-100.
 *
 * @param {object} handoff - Parsed handoff data
 * @param {object} featureSpec - Feature specification
 * @returns {{ score: number, grade: string, passed: boolean, details: string[] }}
 */
function _calcGrade(score) {
  if (score >= 92) return 'excellent';
  if (score >= 80) return 'good';
  if (score >= 70) return 'marginal';
  return 'fail';
}

function gradeHandoff(handoff, featureSpec) {
  let score = 0;
  const maxScore = 100;
  const details = [];

  // R1: Has summary (15 pts)
  if (handoff.summary && handoff.summary.length > 20) {
    score += 15;
    details.push('+15 Summary present');
  } else {
    details.push('+0 No meaningful summary');
  }

  // R2: Files modified reported (15 pts)
  if (handoff.filesModified && handoff.filesModified.length > 0) {
    score += 15;
    details.push(`+15 ${handoff.filesModified.length} files reported`);
  } else {
    details.push('+0 No files reported');
  }

  // R3: Verification commands ran (25 pts)
  const commands = handoff.commandsRun || [];
  if (commands.length > 0) {
    score += 15;
    details.push(`+15 ${commands.length} commands ran`);

    // Bonus: all passed
    const allPassed = commands.every(c => c.exitCode === 0);
    if (allPassed) {
      score += 10;
      details.push('+10 All commands passed');
    } else {
      details.push('+0 Some commands failed');
    }
  } else {
    details.push('+0 No verification commands');
  }

  // R4: Expected verification steps covered (15 pts)
  const expectedSteps = featureSpec.verificationSteps || [];
  if (expectedSteps.length > 0 && commands.length > 0) {
    const covered = expectedSteps.filter(step =>
      commands.some(c => c.command && c.command.includes(step.split(' ')[0]))
    );
    if (covered.length >= expectedSteps.length) {
      score += 15;
      details.push('+15 All verification steps covered');
    } else {
      const partial = Math.round((covered.length / expectedSteps.length) * 15);
      score += partial;
      details.push(`+${partial} ${covered.length}/${expectedSteps.length} verification steps covered`);
    }
  } else if (expectedSteps.length === 0) {
    score += 15;
    details.push('+15 No verification steps required');
  }

  // R5: No blocking issues (15 pts)
  const blockers = (handoff.discoveredIssues || []).filter(i => i.severity === 'blocking');
  if (blockers.length === 0) {
    score += 15;
    details.push('+15 No blocking issues');
  } else {
    details.push(`+0 ${blockers.length} blocking issues`);
  }

  // R6: Skill feedback present (15 pts)
  if (handoff.skillFeedback && typeof handoff.skillFeedback.followedProcedure === 'boolean') {
    score += 10;
    details.push('+10 Skill feedback provided');
    if (handoff.skillFeedback.followedProcedure) {
      score += 5;
      details.push('+5 Procedure followed');
    } else {
      details.push('+0 Procedure not followed');
    }
  }

  const normalizedScore = Math.min(score, maxScore);
  const grade = _calcGrade(normalizedScore);

  return {
    score: normalizedScore,
    grade,
    passed: normalizedScore >= 70,
    details,
  };
}

module.exports = {
  parseHandoff,
  normalizeHandoff,
  extractUnstructured,
  writeHandoff,
  gradeHandoff,
  determineSuccessState,
};
