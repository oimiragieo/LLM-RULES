const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BROKEN_LINKS_FILE = path.join(ROOT, '.claude', 'context', 'tmp', 'docs-broken-links.json');

if (!fs.existsSync(BROKEN_LINKS_FILE)) {
    console.log('No broken links file found.');
    process.exit(0);
}

const brokenLinks = JSON.parse(fs.readFileSync(BROKEN_LINKS_FILE, 'utf8'));

// Group by file
const fileMap = new Map();
for (const link of brokenLinks) {
    const filePath = path.join(ROOT, link.file);
    if (!fileMap.has(filePath)) fileMap.set(filePath, []);
    fileMap.get(filePath).push(link);
}

const MAPPINGS = {
    '.claude/hooks/routing/tool-scope-validator.cjs': 'routing-guard.cjs',
    '.claude/hooks/routing/config-model-validator.cjs': 'routing-guard.cjs',
    '.claude/hooks/monitoring/error-tracker-hook.cjs': 'unified-reflection-handler.cjs',
    '.claude/hooks/validation/creator-compliance-validator.cjs': 'pre-completion-validation.cjs',
    '.claude/archive/hooks/self-healing/loop-prevention.cjs': 'pre-task-unified.cjs',
    '.claude/hooks/safety/loop-prevention.cjs': 'pre-task-unified.cjs',
    '.claude/hooks/monitoring/execution-limit-monitor-hook.cjs': 'user-prompt-unified.cjs',
    '.claude/hooks/routing/task-create-guard.cjs': 'routing-guard.cjs',
    '.claude/hooks/routing/planner-first-guard.cjs': 'routing-guard.cjs',
    '.claude/hooks/routing/security-review-guard.cjs': 'routing-guard.cjs',
    '.claude/hooks/safety/router-write-guard.cjs': 'unified-pre-write-hook.cjs',
    '.claude/hooks/safety/file-placement-guard.cjs': 'unified-pre-write-hook.cjs',
    '.claude/context/plans/': '.claude/context/artifacts/plans/',
    '.claude/context/reports/architecture/architect-review.md': '.claude/context/artifacts/architecture/architect-review.md',
    '.claude/tests/': 'tests/',
    '.claude/hooks/routing/tool-availability-validator.cjs': 'router-tool-lockdown.cjs',
    '.claude/hooks/routing/pre-spawn-task-validator.cjs': 'pre-task-unified.cjs',
    '.claude/hooks/routing/post-spawn-task-updater.cjs': 'post-task-unified.cjs'
};

const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

let totalFixed = 0;

for (const [filePath, links] of fileMap.entries()) {
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    let modifications = 0;

    for (const link of links) {
        // First check if it's a markdown link [text](originalLink)
        // If it is, and we have a mapping, change [text](originalLink) -> [text](mapping)
        // If no mapping, just change to text
        const origLinkEscaped = escapeRegex(link.originalLink);

        let targetText = MAPPINGS[link.originalLink];
        if (!targetText) {
            // Check if there's a file mapped
            const stripped = link.originalLink.replace(/^@/, '').replace(/^\.\//, '');
            targetText = MAPPINGS[stripped];
        }

        // 1. Markdown link replacement
        if (targetText) {
            const mdLinkRegex = new RegExp('\\[([^\\]]+)\\]\\(([' + escapeRegex('\'"`') + ']?)' + origLinkEscaped + '([' + escapeRegex('\'"`') + ']?)\\)', 'g');
            content = content.replace(mdLinkRegex, (match, text) => {
                modifications++;
                return `[${text}](${targetText.startsWith('.') || targetText.startsWith('tests') || targetText.startsWith('/') ? '@' + targetText : text})`;
            });
        }

        const mdLinkDelRegex = new RegExp('\\[([^\\]]+)\\]\\(([' + escapeRegex('\'"`') + ']?)' + origLinkEscaped + '([' + escapeRegex('\'"`') + ']?)\\)', 'g');
        content = content.replace(mdLinkDelRegex, (match, text) => {
            modifications++;
            return `${text}`;
        });

        // 2. Just the plain text link in the document
        if (targetText) {
            const rawRegex = new RegExp(origLinkEscaped, 'g');
            content = content.replace(rawRegex, () => {
                modifications++;
                return targetText;
            });
        }
    }

    if (modifications > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${modifications} references in ${path.basename(filePath)}`);
        totalFixed += modifications;
    }
}

console.log(`Total fixed references: ${totalFixed}`);
