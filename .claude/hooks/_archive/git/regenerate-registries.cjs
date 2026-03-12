#!/usr/bin/env node
/**
 * PRE-COMMIT HOOK: Regenerate registries if agent/skill/tool files changed
 *
 * @hook PreGitCommit
 * @purpose Ensures agent-registry.json, skill-index.json, and tool-manifest.json stay fresh
 * @pattern When agent/skill/tool files modified → regenerate → stage updated registries
 *
 * USAGE:
 * - Registered in .claude/settings.json under hooks.PreGitCommit
 * - Runs automatically before git commit
 * - Auto-stages regenerated files
 *
 * EXITS:
 * - 0: Success (no changes or regeneration successful)
 * - 1: Error (regeneration failed)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();

try {
  // Check if any agent/skill/tool files were modified
  const diff = execSync('git diff --name-only --cached', { encoding: 'utf8', cwd: PROJECT_ROOT });

  const needsAgentRegen = diff.includes('.claude/agents/');
  const needsSkillRegen = diff.includes('.claude/skills/');
  const needsToolRegen = diff.includes('.claude/tools/');

  if (!needsAgentRegen && !needsSkillRegen && !needsToolRegen) {
    // No relevant files changed, exit early
    process.exit(0);
  }

  console.error('[REGEN-HOOK] Relevant files modified, regenerating registries...');

  // Regenerate agent registry if needed
  if (needsAgentRegen) {
    console.error('[REGEN-HOOK] Regenerating agent-registry.json...');
    execSync('node .claude/tools/cli/generate-agent-registry.cjs', {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    execSync('git add .claude/context/agent-registry.json', { cwd: PROJECT_ROOT });
  }

  // Regenerate skill index if needed
  if (needsSkillRegen) {
    console.error('[REGEN-HOOK] Regenerating skill-index.json...');
    const skillIndexPath = path.join(PROJECT_ROOT, '.claude/tools/cli/generate-skill-index.cjs');
    if (fs.existsSync(skillIndexPath)) {
      execSync('node .claude/tools/cli/generate-skill-index.cjs', {
        stdio: 'inherit',
        cwd: PROJECT_ROOT,
      });
      execSync('git add .claude/config/skill-index.json', { cwd: PROJECT_ROOT });
    } else {
      console.error(
        '[REGEN-HOOK] ⚠️  generate-skill-index.cjs not found, skipping skill index regeneration'
      );
    }
  }

  // Regenerate tool manifest if needed
  if (needsToolRegen) {
    console.error('[REGEN-HOOK] Regenerating tool-manifest.json...');
    const toolManifestPath = path.join(
      PROJECT_ROOT,
      '.claude/tools/cli/generate-tool-manifest.cjs'
    );
    if (fs.existsSync(toolManifestPath)) {
      execSync('node .claude/tools/cli/generate-tool-manifest.cjs', {
        stdio: 'inherit',
        cwd: PROJECT_ROOT,
      });
      execSync('git add .claude/config/tool-manifest.json', { cwd: PROJECT_ROOT });
    } else {
      console.error(
        '[REGEN-HOOK] ⚠️  generate-tool-manifest.cjs not found, skipping tool manifest regeneration'
      );
    }
  }

  console.error('[REGEN-HOOK] ✓ Registries regenerated and staged');
  process.exit(0);
} catch (err) {
  console.error('[REGEN-HOOK] ❌ Error:', err.message);
  process.exit(2);
}
