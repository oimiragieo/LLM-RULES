#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { extractKeywords, computeKeywordScore } = require('../routing/skill-auto-router.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const SKILL_INDEX_PATH = path.join(PROJECT_ROOT, '.claude/config/skill-index.json');

let _cache = null;

function loadSkillIndex() {
  let mtime = 0;
  try { mtime = fs.statSync(SKILL_INDEX_PATH).mtimeMs; } catch (_e) { return {}; }
  if (_cache && _cache._mtime === mtime) return _cache.skills;
  let raw = '';
  try { raw = fs.readFileSync(SKILL_INDEX_PATH, 'utf-8'); } catch (_e) { return {}; }
  const parsed = safeParseJSON(raw, null);
  let skills = {};
  if (Array.isArray(parsed)) {
    for (const item of parsed) { if (item && item.name) skills[item.name] = item; }
  } else if (parsed && typeof parsed === 'object') {
    skills = (parsed.skills && typeof parsed.skills === 'object') ? parsed.skills : parsed;
  }
  _cache = { skills, _mtime: mtime };
  return skills;
}

function recommendSkillsFallback(query, { limit = 5, minScore = 0.2 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const queryKeywords = extractKeywords(q);
  if (queryKeywords.length === 0) return [];
  const skills = loadSkillIndex();
  const results = [];
  for (const [skillName, skillData] of Object.entries(skills)) {
    const data = (skillData && typeof skillData === 'object') ? skillData : {};
    const nameTokens = extractKeywords(skillName);
    const descTokens = extractKeywords(String(data.description || data.displayName || ''));
    const skillKeywords = [...nameTokens, ...descTokens];
    const score = computeKeywordScore(queryKeywords, skillKeywords);
    if (score < minScore) continue;
    results.push({ name: skillName, score, description: String(data.description || data.displayName || skillName) });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function _resetCache() { _cache = null; }

module.exports = { recommendSkillsFallback, _resetCache };