const fs = require('fs');
const path = require('path');

const agentsDir = path.join(process.cwd(), '.claude/agents');
const subdirs = fs.readdirSync(agentsDir).filter(f => fs.statSync(path.join(agentsDir, f)).isDirectory());

let updatedCount = 0;

for (const subdir of subdirs) {
    const dirPath = path.join(agentsDir, subdir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
        const filePath = path.join(dirPath, file);
        let content = fs.readFileSync(filePath, 'utf8');

        // 1. Inject memory-search into skills list if it doesn't exist
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!yamlMatch) continue;

        const yamlPart = yamlMatch[1];
        let newYamlPart = yamlPart;

        // Find skills: block
        const skillsStart = yamlPart.indexOf('skills:');
        if (skillsStart !== -1) {
            // Find end of skills block (next top-level key or end of yaml)
            let skillsEnd = yamlPart.indexOf('\nw', skillsStart);
            if (skillsEnd === -1) {
                skillsEnd = yamlPart.indexOf('\ncontext_files:', skillsStart);
            }
            if (skillsEnd === -1) {
                skillsEnd = yamlPart.indexOf('\ncontext_strategy:', skillsStart);
            }
            if (skillsEnd === -1) {
                skillsEnd = yamlPart.indexOf('\ncapabilities:', skillsStart);
            }
            if (skillsEnd === -1) {
                skillsEnd = yamlPart.length;
            }

            const skillsBlock = yamlPart.substring(skillsStart, skillsEnd);
            if (!skillsBlock.includes('- memory-search') && !skillsBlock.includes('memory-search')) {
                const insertPos = skillsStart + 7; // after 'skills:'
                newYamlPart = yamlPart.substring(0, insertPos) + '\n  - memory-search' + yamlPart.substring(insertPos);
            }
        }

        // Replace yaml part
        content = content.replace(/^---\n([\s\S]*?)\n---/, '---\n' + newYamlPart + '\n---');

        // 2. Inject the new Memory Protocol logic
        const memProtoStart = content.indexOf('## Memory Protocol (MANDATORY)');
        if (memProtoStart !== -1) {
            const beforeProto = content.substring(0, memProtoStart);

            // Find the next heading after Memory Protocol
            const afterProtoStartIdx = content.indexOf('\n## ', memProtoStart + 10);
            let afterProto = '';
            if (afterProtoStartIdx !== -1) {
                afterProto = content.substring(afterProtoStartIdx);
            }

            const newMemProto = '## Memory Protocol (MANDATORY)\n\n' +
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
                '> ASSUME INTERRUPTION: Your context may reset. If it\'s not in memory, it didn\'t happen.';

            content = beforeProto + newMemProto + afterProto;
        }

        fs.writeFileSync(filePath, content, 'utf8');
        updatedCount++;
    }
}

console.log('Updated ' + updatedCount + ' agent files.');
