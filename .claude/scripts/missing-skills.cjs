const fs = require('fs');
const catalogPath = '.claude/docs/skill-catalog.md';
const indexPath = '.claude/config/skill-index.json';

const content = fs.readFileSync(catalogPath, 'utf8');
const skillPattern = /\|\s*`([^`]+)`\s*\|/g;
let match;
const catalogSkills = [];
while ((match = skillPattern.exec(content)) !== null) {
  const skillName = match[1].replace(/~~/g, '');
  if (!skillName.startsWith('~~')) {
    catalogSkills.push(skillName);
  }
}

const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const indexedSkills = Object.keys(indexData.skills);

const missing = indexedSkills.filter(
  skill => !catalogSkills.includes(skill) && skill !== 'testing-expert'
);

console.log('Missing skills:');
console.log(missing);
