
const fs = require('fs');
const path = require('path');
const memoryManager = require('../.claude/lib/memory/memory-manager.cjs');

const PROJECT_ROOT = process.cwd();
const GOTCHAS_FILE = path.join(PROJECT_ROOT, '.claude/context/memory/gotchas.json');

// Helper to read raw file
function readGotchas() {
    if (!fs.existsSync(GOTCHAS_FILE)) return [];
    return JSON.parse(fs.readFileSync(GOTCHAS_FILE, 'utf8'));
}

async function testAccessTracking() {
    console.log('[TEST] Starting Access Tracking Verification...');

    // 1. Record a new gotcha
    const testGotchaText = `Test Gotcha ${Date.now()}`;
    console.log(`[TEST] Recording gotcha: "${testGotchaText}"`);
    memoryManager.recordGotcha(testGotchaText, PROJECT_ROOT);

    // 2. Verify initialization
    let gotchas = readGotchas();
    let entry = gotchas.find(g => g.text === testGotchaText);

    if (!entry) throw new Error('Gotcha not recorded');
    if (entry.accessCount !== 0) throw new Error(`Expected accessCount 0, got ${entry.accessCount}`);
    if (entry.lastAccessed !== null) throw new Error(`Expected lastAccessed null, got ${entry.lastAccessed}`);
    console.log('[TEST] Initialization verified (accessCount: 0, lastAccessed: null)');

    // 3. Simulate read (Load Memory)
    console.log('[TEST] Loading memory to trigger access tracking...');
    memoryManager.loadMemoryForContext(PROJECT_ROOT);

    // 4. Verify update
    gotchas = readGotchas();
    entry = gotchas.find(g => g.text === testGotchaText);

    if (entry.accessCount !== 1) throw new Error(`Expected accessCount 1, got ${entry.accessCount}`);
    if (!entry.lastAccessed) throw new Error('Expected lastAccessed to be set');
    console.log(`[TEST] Access update verified (accessCount: ${entry.accessCount}, lastAccessed: ${entry.lastAccessed})`);

    // Clean up
    console.log('[TEST] Cleaning up...');
    const filtered = gotchas.filter(g => g.text !== testGotchaText);
    fs.writeFileSync(GOTCHAS_FILE, JSON.stringify(filtered, null, 2));
    console.log('[TEST] Done.');
}

testAccessTracking().catch(err => {
    console.error('[TEST] Failed:', err);
    process.exit(1);
});
