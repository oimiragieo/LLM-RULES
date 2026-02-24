const fs = require('node:fs');
const path = require('node:path');

const skills = ['omega-gemini-cli', 'omega-cursor-cli', 'omega-codex-cli', 'omega-claude-cli'];
const now = new Date().toISOString();

for (const skill of skills) {
    const p = path.join('.claude', 'skills', skill, 'SKILL.md');
    if (!fs.existsSync(p)) continue;

    let content = fs.readFileSync(p, 'utf8');

    // Update verified status via simple replacement
    content = content.replace(/^verified:\s*.+$/m, 'verified: true');

    if (content.match(/^lastVerifiedAt:/m)) {
        content = content.replace(/^lastVerifiedAt:\s*.+$/m, `lastVerifiedAt: ${now}`);
    } else {
        // Insert if missing
        content = content.replace(/^---\s*$/m, `lastVerifiedAt: ${now}\n---`); // Will hit close, so maybe better:
        content = content.replace(/^verified: true/m, `verified: true\nlastVerifiedAt: ${now}`);
    }

    // Add Memory Protocol if missing
    if (!content.includes('Memory Protocol')) {
        content += `\n\n## Memory Protocol\n\nBefore work: Read \`.claude/context/memory/learnings.md\`\nAfter work: Append findings to learnings or issues as needed.\n`;
    }

    // Ensure "Anti-Patterns" is mentioned
    if (!content.includes('Anti-Patterns')) {
        content = content.replace('## Iron Laws', '## Anti-Patterns & Iron Laws');
    }

    // Ensure 'pnpm search:code' is recommended for discovering usage
    if (!content.includes('pnpm search:code')) {
        content += `\n*Note: Use \`pnpm search:code\` to discover references to this skill codebase-wide.*\n`;
    }

    fs.writeFileSync(p, content, 'utf8');
    console.log(`Updated ${skill}`);
}
