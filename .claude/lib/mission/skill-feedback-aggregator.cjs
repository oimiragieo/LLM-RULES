// Agent: developer | Task: skill-feedback-aggregator | Session: 2026-04-07
'use strict';

/**
 * Skill Feedback Aggregator
 *
 * Aggregates deviation patterns from mission handoffs per skillName.
 * When >=3 handoffs report the same deviation pattern for a skill,
 * flags the skill for update via a recommendation.
 *
 * Stores aggregated feedback in skill-feedback-ledger.jsonl inside
 * the mission bundle directory.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Extract skill feedback from all handoffs in a mission directory.
 *
 * @param {string} handoffsDir - Path to handoffs/ directory
 * @returns {Map<string, object[]>} Map of skillName → array of feedback entries
 */
function extractFeedbackBySkill(handoffsDir) {
  const feedbackMap = new Map();

  if (!fs.existsSync(handoffsDir)) return feedbackMap;

  const files = fs.readdirSync(handoffsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(handoffsDir, file), 'utf8');
      const handoff = JSON.parse(content);

      if (!handoff.handoff || !handoff.handoff.skillFeedback) continue;

      const { skillFeedback } = handoff.handoff;
      const featureId = handoff.featureId || 'unknown';

      // We need the skillName from the feature — derive from filename or handoff
      // The skillName isn't in the handoff schema, so we collect by featureId pattern
      const entry = {
        featureId,
        timestamp: handoff.timestamp,
        followedProcedure: skillFeedback.followedProcedure,
        deviations: skillFeedback.deviations || [],
        suggestedChanges: skillFeedback.suggestedChanges || [],
      };

      if (!feedbackMap.has(featureId)) {
        feedbackMap.set(featureId, []);
      }
      feedbackMap.get(featureId).push(entry);
    } catch {
      // Skip malformed files
    }
  }

  return feedbackMap;
}

/**
 * Aggregate feedback from handoffs enriched with skill names from features.json.
 *
 * @param {string} missionDir - Mission bundle directory
 * @returns {{ skillFeedback: object[], recommendations: string[] }}
 */
function aggregateFeedback(missionDir) {
  const handoffsDir = path.join(missionDir, 'handoffs');
  const featuresPath = path.join(missionDir, 'features.json');

  // Build featureId -> skillName map
  const skillMap = new Map();
  if (fs.existsSync(featuresPath)) {
    try {
      const doc = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
      for (const f of doc.features || []) {
        skillMap.set(f.id, f.skillName);
      }
    } catch {
      // Continue without skill mapping
    }
  }

  // Extract all feedback
  const feedbackByFeature = extractFeedbackBySkill(handoffsDir);

  // Group by skillName
  const bySkill = new Map();
  for (const [featureId, entries] of feedbackByFeature) {
    const skillName = skillMap.get(featureId) || 'unknown';
    if (!bySkill.has(skillName)) {
      bySkill.set(skillName, []);
    }
    bySkill.get(skillName).push(...entries);
  }

  // Aggregate deviation patterns per skill
  const skillFeedback = [];
  const recommendations = [];

  for (const [skillName, entries] of bySkill) {
    const totalHandoffs = entries.length;
    const procedureFollowed = entries.filter(e => e.followedProcedure).length;
    const allDeviations = entries.flatMap(e => e.deviations);
    const allSuggestions = entries.flatMap(e => e.suggestedChanges);

    // Count deviation patterns (by step or description)
    const deviationCounts = new Map();
    for (const dev of allDeviations) {
      const key = typeof dev === 'string' ? dev : (dev.step || dev.whatIDidInstead || JSON.stringify(dev));
      deviationCounts.set(key, (deviationCounts.get(key) || 0) + 1);
    }

    // Find recurring deviations (>=3 occurrences)
    const recurring = [];
    for (const [pattern, count] of deviationCounts) {
      if (count >= 3) {
        recurring.push({ pattern, count });
        recommendations.push(
          `Skill "${skillName}" has ${count} recurring deviation(s): "${pattern}". Consider updating the skill procedure.`,
        );
      }
    }

    skillFeedback.push({
      skillName,
      totalHandoffs,
      procedureFollowedRate: totalHandoffs > 0
        ? Math.round((procedureFollowed / totalHandoffs) * 100)
        : 0,
      uniqueDeviations: deviationCounts.size,
      recurringDeviations: recurring,
      suggestedChanges: [...new Set(allSuggestions)],
    });
  }

  // Write ledger
  const ledgerPath = path.join(missionDir, 'skill-feedback-ledger.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    skillCount: skillFeedback.length,
    totalRecommendations: recommendations.length,
    skills: skillFeedback,
  };
  fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');

  return { skillFeedback, recommendations };
}

/**
 * Check if a specific skill has recurring deviations.
 *
 * @param {string} missionDir - Mission bundle directory
 * @param {string} skillName - Skill to check
 * @param {number} [threshold=3] - Minimum occurrences to flag
 * @returns {{ needsUpdate: boolean, deviations: object[] }}
 */
function checkSkillHealth(missionDir, skillName, threshold = 3) {
  const { skillFeedback } = aggregateFeedback(missionDir);
  const skill = skillFeedback.find(s => s.skillName === skillName);

  if (!skill) return { needsUpdate: false, deviations: [] };

  const flagged = skill.recurringDeviations.filter(d => d.count >= threshold);

  return {
    needsUpdate: flagged.length > 0,
    deviations: flagged,
    procedureFollowedRate: skill.procedureFollowedRate,
  };
}

module.exports = {
  aggregateFeedback,
  checkSkillHealth,
  extractFeedbackBySkill,
};
