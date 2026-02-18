import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

function collectAgentFiles(agentsDir) {
  const agentDirs = ['core', 'specialized', 'domain', 'orchestrators'];
  const agentFiles = [];
  let agentCount = 0;
  for (const dir of agentDirs) {
    const dirPath = join(agentsDir, dir);
    if (!existsSync(dirPath)) continue;
    try {
      const files = readdirSync(dirPath).filter(f => f.endsWith('.md'));
      agentCount += files.length;
      for (const file of files) {
        agentFiles.push(join(dirPath, file));
      }
    } catch (_e) {
      // ignore unreadable directories
    }
  }
  return { agentCount, agentFiles };
}

function scanSkills(skillsDir, agentFiles) {
  const orphanedSkills = [];
  let skillCount = 0;
  if (!existsSync(skillsDir)) return { skillCount, orphanedSkills };
  try {
    const skillDirs = readdirSync(skillsDir);
    for (const skill of skillDirs) {
      if (!existsSync(join(skillsDir, skill, 'SKILL.md'))) continue;
      skillCount++;
      let referenced = false;
      for (const agentFile of agentFiles) {
        try {
          if (readFileSync(agentFile, 'utf8').includes(skill)) {
            referenced = true;
            break;
          }
        } catch (_e) {
          // ignore read failures
        }
      }
      if (!referenced) orphanedSkills.push(skill);
    }
  } catch (_e) {
    // ignore scan failures
  }
  return { skillCount, orphanedSkills };
}

function scanHooks(settingsPath, rootDir) {
  const orphanedHooks = [];
  let hooks = 0;
  if (!existsSync(settingsPath)) return { hooks, orphanedHooks };
  try {
    const settings = safeParseJSON(readFileSync(settingsPath, 'utf8'), {});
    for (const trigger of Object.keys(settings.hooks || {})) {
      for (const entry of settings.hooks[trigger] || []) {
        hooks += entry.hooks?.length || 0;
        for (const hook of entry.hooks || []) {
          const match = String(hook?.command || '').match(/node\s+(.+\.cjs)/);
          if (!match) continue;
          const hookPath = join(rootDir, match[1]);
          if (!existsSync(hookPath)) orphanedHooks.push(match[1]);
        }
      }
    }
  } catch (_e) {
    // ignore parse failures
  }
  return { hooks, orphanedHooks };
}

function countWorkflows(workflowsDir) {
  let workflows = 0;
  if (!existsSync(workflowsDir)) return workflows;
  try {
    for (const cat of readdirSync(workflowsDir)) {
      const catPath = join(workflowsDir, cat);
      try {
        const files = readdirSync(catPath).filter(
          f => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.md')
        );
        workflows += files.length;
      } catch (_e) {
        // skip non-directories
      }
    }
  } catch (_e) {
    // ignore read failures
  }
  return workflows;
}

function buildIssues(stats) {
  const issues = [];
  if (stats.agents === 0) issues.push('No agents discovered');
  if (stats.skills === 0) issues.push('No skills discovered');
  if (stats.hooks === 0) issues.push('No hooks registered in settings.json');
  if (stats.workflows === 0) issues.push('No workflows discovered');
  if (stats.orphanedSkills.length > 0) {
    issues.push(`Orphaned skills: ${stats.orphanedSkills.slice(0, 10).join(', ')}`);
  }
  if (stats.orphanedHooks.length > 0) {
    issues.push(`Hooks referenced in settings but missing on disk: ${stats.orphanedHooks.length}`);
  }
  return issues;
}

export function ecosystemHealthCheck(options = {}) {
  const agentsDir = options.agentsDir;
  const skillsDir = options.skillsDir;
  const workflowsDir = options.workflowsDir;
  const settingsPath = options.settingsPath;
  const rootDir = options.rootDir || process.cwd();

  const { agentCount, agentFiles } = collectAgentFiles(agentsDir);
  const { skillCount, orphanedSkills } = scanSkills(skillsDir, agentFiles);
  const { hooks, orphanedHooks } = scanHooks(settingsPath, rootDir);
  const workflows = countWorkflows(workflowsDir);

  const stats = {
    agents: agentCount,
    skills: skillCount,
    hooks,
    workflows,
    orphanedSkills,
    orphanedHooks,
    missingDependencies: [],
  };
  const issues = buildIssues(stats);

  return {
    healthy: issues.length === 0,
    stats,
    issues,
  };
}
