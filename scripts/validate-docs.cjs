/* eslint-disable complexity -- link-validation loop with many skip conditions */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, '.claude', 'docs');

function getMdFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'CLAUDE_CLI_DOCS') continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getMdFiles(filePath, fileList);
    } else if (file.endsWith('.md') || file.endsWith('.MD')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const mdFiles = getMdFiles(DOCS_DIR);
const errors = [];

const linkRegex =
  /(?:\[[^\]]*\]\()?(?:[`'"]?)((?:@?\.claude\/|\.\/|\.\.\/|scripts\/|tests\/)[a-zA-Z0-9_\-./]+(?:#.*)?)(?:[`'"]?)?/g;
const mdLinkRegex = /\[[^\]]+\]\((?!http)([^)]+)\)/g;

for (const file of mdFiles) {
  let content = fs.readFileSync(file, 'utf8');
  // Strip code blocks to avoid false positives on code examples
  content = content.replace(/```[\s\S]*?```/g, '');

  const relFile = path.relative(ROOT, file);
  const lines = content.split('\n');

  lines.forEach((lineText, lineIdx) => {
    const checkLine = regex => {
      let localMatch;
      while ((localMatch = regex.exec(lineText)) !== null) {
        const linkPath = localMatch[1];
        let cleanLink = linkPath.split('#')[0];
        cleanLink = cleanLink.replace(/^@/, '');
        cleanLink = cleanLink.replace(/^[\\`'"]/, '').replace(/[\\`'"]$/, '');
        cleanLink = cleanLink.trim();

        if (
          !cleanLink ||
          cleanLink.startsWith('http') ||
          cleanLink.includes('{{') ||
          cleanLink.includes('<') ||
          cleanLink.startsWith('mailto:')
        )
          continue;
        if (cleanLink.match(/^\*(.*)\*$/)) continue;
        if (cleanLink === '.' || cleanLink === '..') continue;
        if (cleanLink.includes('()')) continue;

        let absolutePath = '';
        if (
          cleanLink.startsWith('.claude/') ||
          cleanLink.startsWith('scripts/') ||
          cleanLink.startsWith('tests/')
        ) {
          absolutePath = path.join(ROOT, cleanLink);
        } else if (
          cleanLink.startsWith('./') ||
          cleanLink.startsWith('../') ||
          !cleanLink.startsWith('/')
        ) {
          absolutePath = path.resolve(path.dirname(file), cleanLink);
        } else if (cleanLink.startsWith('/')) {
          absolutePath = path.join(ROOT, cleanLink.substring(1));
        }

        if (absolutePath && !fs.existsSync(absolutePath)) {
          // Ignore common false positives like example.cjs
          if (
            absolutePath.includes('example') ||
            absolutePath.includes('my-') ||
            absolutePath.includes('/...')
          )
            continue;
          errors.push({
            file: relFile,
            lineNum: lineIdx + 1,
            originalLink: linkPath,
            resolvedPath: path.relative(ROOT, absolutePath),
          });
        }
      }
    };
    checkLine(linkRegex);

    // reset regex index
    mdLinkRegex.lastIndex = 0;
    checkLine(mdLinkRegex);
  });
}

// Deduplicate errors
const uniqueErrors = [];
const seen = new Set();
for (const e of errors) {
  const key = `${e.file}:${e.lineNum}:${e.originalLink}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueErrors.push(e);
  }
}

fs.writeFileSync(
  path.join(ROOT, '.claude', 'context', 'tmp', 'docs-broken-links.json'),
  JSON.stringify(uniqueErrors, null, 2)
);
console.log(
  `Saved ${uniqueErrors.length} unique broken links to .claude/context/tmp/docs-broken-links.json`
);
