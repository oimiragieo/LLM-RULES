/**
 * skills.cjs — Skill extraction and auto-injection engine
 *
 * OMC-inspired: learns from completed tasks, auto-injects matching
 * patterns in future sessions. The daemon gets smarter over time.
 *
 * Flow:
 *   1. Task completes successfully → extractSkill() via haiku
 *   2. Skill stored as JSON in channel-memory/skills/
 *   3. Future messages → findMatchingSkills() checks triggers
 *   4. Matching skills injected as context into renderer prompt
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_SKILLS = 50;

class SkillStore {
  constructor(storageDir) {
    this.skillsDir = path.join(storageDir, 'skills');
    this.indexPath = path.join(this.skillsDir, '_index.json');
    this.skills = [];
    fs.mkdirSync(this.skillsDir, { recursive: true });
    this._load();
  }

  /**
   * Add or update a skill.
   */
  addSkill(skill) {
    const { name, triggers, description, solution } = skill;
    if (!name || !triggers || !solution) return;

    // Deduplicate by name
    const existing = this.skills.findIndex(s => s.name === name);
    const entry = {
      name,
      triggers: triggers.map(t => t.toLowerCase()),
      description: description || '',
      solution: solution.slice(0, 2000),
      createdAt: existing >= 0 ? this.skills[existing].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existing >= 0) {
      this.skills[existing] = entry;
    } else {
      this.skills.push(entry);
    }

    // Cap at MAX_SKILLS — remove oldest
    while (this.skills.length > MAX_SKILLS) this.skills.shift();

    this._save();
  }

  /**
   * Extract a skill from a completed task using haiku (cheap + fast).
   * Async-safe: call via setImmediate, failure doesn't affect response.
   */
  extractSkill(task, result) {
    if (!task || !result || result.length < 50) return;

    try {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;

      const prompt = [
        'Extract a reusable skill from this completed task.',
        'Return ONLY JSON: {"name":"short-kebab-name","triggers":["keyword1","keyword2"],"description":"one line","solution":"the pattern/fix"}',
        'Triggers should be 2-5 lowercase keywords that would appear in similar future requests.',
        `Task: ${task.slice(0, 500)}`,
        `Result: ${result.slice(0, 500)}`,
      ].join(' ').replace(/"/g, "'").slice(0, 2000);

      const output = execSync(
        `claude -p "${prompt}" --dangerously-skip-permissions --model haiku --max-turns 1`,
        { encoding: 'utf8', timeout: 30000, env, windowsHide: true, shell: true, stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      const match = output.match(/\{[\s\S]*\}/);
      if (match) {
        const skill = JSON.parse(match[0]);
        if (skill.name && skill.triggers && skill.solution) {
          this.addSkill(skill);
          return skill.name;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Find skills whose triggers match the given text.
   */
  findMatchingSkills(text) {
    if (!text) return [];
    const lower = text.toLowerCase();
    return this.skills.filter(skill =>
      skill.triggers.some(trigger => lower.includes(trigger))
    );
  }

  /**
   * Get formatted context string for matching skills.
   * Injected into the renderer prompt.
   */
  getSkillContext(text) {
    const matches = this.findMatchingSkills(text);
    if (matches.length === 0) return '';
    return '\n\nRelevant skills from previous sessions:\n' +
      matches.slice(0, 3).map(s => `- ${s.name}: ${s.solution.slice(0, 300)}`).join('\n');
  }

  _load() {
    try {
      if (fs.existsSync(this.indexPath)) {
        this.skills = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      }
    } catch {}
  }

  _save() {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(this.skills, null, 2), 'utf8');
    } catch {}
  }
}

module.exports = { SkillStore };
