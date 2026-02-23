const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(process.cwd(), '.claude/agents');
const INDEX_PATH = path.join(process.cwd(), '.claude/config/skill-index.json');

// 1. Build index map
const rawIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
const indexMap = new Map();
for (const [name, entry] of Object.entries(rawIndex.skills || {})) {
  indexMap.set(name, entry);
}

// 2. Parse frontmatter of agents and update `skills` list
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('_archive')) results = results.concat(walk(file));
    } else if (file.endsWith('.md')) {
      results.push(file);
    }
  });
  return results;
}

const agentFiles = walk(AGENTS_DIR);
agentFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\n---/);
  if (!match) return;

  const yaml = match[1];
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  if (!nameMatch) return;
  const agentName = nameMatch[1].replace(/['"]/g, '').trim();

  // Find all skills that list this agent as PRIMARY
  const expectedSkills = new Set();
  for (const [skillName, entry] of indexMap.entries()) {
    if (entry.aliasOf) continue;
    const pri = Array.isArray(entry.agentPrimary) ? entry.agentPrimary : [];
    if (pri.map(a => a.toLowerCase()).includes(agentName.toLowerCase())) {
      expectedSkills.add(skillName);
    }
  }

  // Rewrite `skills:` block
  const lines = yaml.split(/\r?\n/);
  const newLines = [];
  let inSkills = false;
  let hasSkillsBlock = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^skills:\s*(\[.*\])?$/)) {
      hasSkillsBlock = true;
      inSkills = true;
      newLines.push('skills:');
      Array.from(expectedSkills)
        .sort()
        .forEach(s => newLines.push(`  - ${s}`));
    } else if (inSkills && lines[i].startsWith('  - ')) {
      continue; // skip old skill items
    } else if (inSkills && !lines[i].startsWith('  - ')) {
      inSkills = false;
      newLines.push(lines[i]);
    } else {
      newLines.push(lines[i]);
    }
  }

  if (!hasSkillsBlock && expectedSkills.size > 0) {
    newLines.push('skills:');
    Array.from(expectedSkills)
      .sort()
      .forEach(s => newLines.push(`  - ${s}`));
  }

  const newYaml = newLines.join('\n');
  if (yaml !== newYaml) {
    content = content.replace(yaml, newYaml);
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated Agent: ${agentName}`);
  }
});
