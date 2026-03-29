import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot() {
  const dir = process.cwd();
  if (fs.existsSync(path.join(dir, '.claude'))) {
    return dir;
  }
  return dir;
}

const PROJECT_ROOT = findProjectRoot();
const CATALOG_PATH = path.join(PROJECT_ROOT, '.claude', 'docs', 'skill-catalog.md');
const INDEX_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'skill-index.json');

function main() {
  const indexRaw = fs.readFileSync(INDEX_PATH, 'utf8');
  const indexData = JSON.parse(indexRaw);
  const indexMap = new Map();

  for (const [name, entry] of Object.entries(indexData.skills || {})) {
    indexMap.set(name, entry);
  }

  const catalogLines = fs.readFileSync(CATALOG_PATH, 'utf8').split('\n');
  let updatedCount = 0;

  for (let i = 0; i < catalogLines.length; i++) {
    const line = catalogLines[i];

    // Regex matches rows with backticked skill names, expecting exactly 3 columns (4 pipes) inside the row.
    // e.g. | `skill-name` | Desc | Agents |
    // match:
    // [0]: full string
    // [1]: optional ~~
    // [2]: skill name
    // [3]: optional ~~
    // [4]: second column (Description)
    // [5]: third column (Agents)
    const match = line.match(/^\|\s*(~~)?`([^`]+)`(~~)?\s*\|([\s\S]+?)\|([\s\S]+?)\|$/);

    if (match) {
      const isDeprecated = Boolean(match[1]) || Boolean(match[3]);
      if (isDeprecated) continue;

      const skillName = match[2].trim();
      const entry = indexMap.get(skillName);

      if (!entry) continue;
      if (entry.aliasOf) continue;

      const lastCell = match[5].trim();
      // Skip if it uses a wildcard like 'all agents'
      if (
        /all agents/i.test(lastCell) ||
        /\d+\+\s*agents/i.test(lastCell) ||
        /all creators/i.test(lastCell) ||
        /\(all [^)]*\)/i.test(lastCell) ||
        /^all\s/i.test(lastCell)
      ) {
        continue;
      }

      const currentAgentsStr = lastCell;
      let primaryAgents = Array.isArray(entry.agentPrimary) ? [...entry.agentPrimary] : [];

      // agentPrimary might be empty for some skills. We should at least put something or leave it blank
      if (primaryAgents.length === 0) {
        primaryAgents = ['developer']; // fallback
      }

      const newAgentsStr = primaryAgents.join(', ');

      // If the list of agents has changed (ignoring whitespace differences around commas)
      const currentNorm = currentAgentsStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .sort()
        .join(',');
      const newNorm = primaryAgents
        .map(s => s.trim())
        .filter(Boolean)
        .sort()
        .join(',');

      if (currentNorm !== newNorm) {
        // Reconstruct the line accurately preserving whitespace for column 1 and 2 if possible
        // match[4] is the middle column
        catalogLines[i] = `| \`${skillName}\` |${match[4]}| ${newAgentsStr} |`;
        updatedCount++;
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(CATALOG_PATH, catalogLines.join('\n'), 'utf8');
    console.log(`Updated ${updatedCount} rows in skill-catalog.md`);
  } else {
    console.log('No rows needed updating in skill-catalog.md');
  }
}

main();
