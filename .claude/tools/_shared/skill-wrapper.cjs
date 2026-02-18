'use strict';

const fs = require('fs');
const { Skill } = require('../../lib/tools/skill-tool.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

function parseInputFromStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    const parsed = safeParseJSON(raw, {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function executeSkillBackedTool(toolName, defaultSkill, input = {}, deps = {}) {
  const skillFn = typeof deps.skillFn === 'function' ? deps.skillFn : Skill;
  const requestedSkill =
    typeof input.skill === 'string' && input.skill.trim()
      ? input.skill.trim()
      : defaultSkill || toolName;

  const args =
    typeof input.args === 'string' && input.args.trim()
      ? input.args.trim()
      : typeof input.prompt === 'string' && input.prompt.trim()
        ? input.prompt.trim()
        : null;

  const result = skillFn({ skill: requestedSkill, args });
  if (!result || result.success !== true) {
    return {
      ok: false,
      tool: toolName,
      requestedSkill,
      error: result?.error || `Skill "${requestedSkill}" not found`,
    };
  }

  return {
    ok: true,
    tool: toolName,
    requestedSkill,
    loadedSkill: result.skill,
    displayName: result.displayName,
    description: result.description,
    filePath: result.filePath,
    message: result.message,
    args,
  };
}

function runSkillToolCli(toolName, defaultSkill) {
  const input = parseInputFromStdin();
  const output = executeSkillBackedTool(toolName, defaultSkill, input);
  process.stdout.write(JSON.stringify(output) + '\n');
  if (!output.ok) {
    process.exitCode = 1;
  }
}

module.exports = {
  executeSkillBackedTool,
  parseInputFromStdin,
  runSkillToolCli,
};
