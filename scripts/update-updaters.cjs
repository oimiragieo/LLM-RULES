const fs = require('fs');

// 1. Update agent-updater/SKILL.md
let agentUpdater = fs.readFileSync('.claude/skills/agent-updater/SKILL.md', 'utf8');
agentUpdater = agentUpdater.replace(
    '(which mandates reading BOTH learnings and decisions)',
    '(which mandates querying semantic memory `node .claude/lib/memory/memory-search.cjs` and reading BOTH learnings and decisions)'
);
agentUpdater = agentUpdater.replace(
    'and `code-semantic-search`.',
    '`code-semantic-search`, and `memory-search`.'
);
fs.writeFileSync('.claude/skills/agent-updater/SKILL.md', agentUpdater);

// 2. Update skill-updater/SKILL.md
let skillUpdater = fs.readFileSync('.claude/skills/skill-updater/SKILL.md', 'utf8');
skillUpdater = skillUpdater.replace(
    'ensuring it reads both `learnings.md` and `decisions.md`',
    'ensuring it queries semantic memory using `memory-search.cjs` and reads both `learnings.md` and `decisions.md`'
);

// Replace the bottom Memory Protocol section in skill-updater
const startIndex = skillUpdater.indexOf('## Memory Protocol (MANDATORY)');
if (startIndex !== -1) {
    const replacement = '## Memory Protocol (MANDATORY)\n\n' +
        '**Before starting any task, you must query semantic memory and read recent static memory:**\n\n' +
        '```bash\n' +
        'node .claude/lib/memory/memory-search.cjs "<your specific task domain/concept>"\n' +
        'cat .claude/context/memory/learnings.md\n' +
        'cat .claude/context/memory/decisions.md\n' +
        '```\n\n' +
        '**After completing work, record findings:**\n\n' +
        '- New pattern/solution -> Append to `.claude/context/memory/learnings.md`\n' +
        '- Roadblock/issue -> Append to `.claude/context/memory/issues.md`\n' +
        '- Architecture change -> Update `.claude/context/memory/decisions.md`\n\n' +
        '**During long tasks:** Use `.claude/context/memory/active_context.md` as scratchpad.\n\n' +
        '> ASSUME INTERRUPTION: Your context may reset. If it\'s not in memory, it didn\'t happen.\n';

    skillUpdater = skillUpdater.substring(0, startIndex) + replacement;
}

fs.writeFileSync('.claude/skills/skill-updater/SKILL.md', skillUpdater);
console.log('Successfully updated agent-updater and skill-updater');
