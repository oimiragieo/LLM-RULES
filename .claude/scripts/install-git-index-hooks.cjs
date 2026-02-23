const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const HOOKS_DIR = path.join(PROJECT_ROOT, '.git', 'hooks');

const HOOKS = [
    {
        name: 'post-checkout',
        content: `#!/bin/sh
# Auto-update the Agent Studio codebase index after switching branches

PREV_HEAD=$1
NEW_HEAD=$2
CHECKOUT_TYPE=$3

# Only run if a branch was checked out (not a file checkout) & HEAD changed
if [ "$CHECKOUT_TYPE" = "1" ] && [ "$PREV_HEAD" != "$NEW_HEAD" ]; then
    echo ""
    echo "🌿 [Agent Studio] Branch change detected. Refreshing Codebase Index in background..."
    echo "⚠️  WARNING: You may experience temporary CPU spikes or degradation for the next few minutes while the background indexer runs."
    echo ""
    # Ensure logs dir exists
    export LANCEDB_EMBEDDING_MODE="off"
    mkdir -p .claude/context/logs
    # Run quietly in background
    node --max-old-space-size=4096 --expose-gc .claude/tools/cli/index-codebase.cjs index > .claude/context/logs/git-index-hook.log 2>&1 &
fi
`
    },
    {
        name: 'post-merge',
        content: `#!/bin/sh
# Auto-update the Agent Studio codebase index after pulling/merging code

echo ""
echo "🔀 [Agent Studio] Merge completed. Refreshing Codebase Index in background..."
echo "⚠️  WARNING: You may experience temporary CPU spikes or degradation for the next few minutes while the background indexer runs."
echo ""
export LANCEDB_EMBEDDING_MODE="off"
mkdir -p .claude/context/logs
node --max-old-space-size=4096 --expose-gc .claude/tools/cli/index-codebase.cjs index > .claude/context/logs/git-index-hook.log 2>&1 &
`
    }
];

function installHooks() {
    if (!fs.existsSync(HOOKS_DIR)) {
        console.error(`Git hooks directory not found at ${HOOKS_DIR}. Not in a valid git repository.`);
        process.exit(1);
    }

    for (const hook of HOOKS) {
        const hookPath = path.join(HOOKS_DIR, hook.name);

        // Write hook
        fs.writeFileSync(hookPath, hook.content, { encoding: 'utf8', mode: 0o755 });
        console.log(`✅ Installed hook: ${hook.name}`);
    }

    console.log('\nAll git hooks successfully installed! The indexer will now trigger implicitly in the background on git checkout and git pull.');
}

installHooks();
