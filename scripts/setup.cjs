#!/usr/bin/env node
/**
 * Agent Studio Setup UX Wizard
 * Solves the barrier to entry by bundling all setup commands into one smooth UI flow.
 * Note: Uses NO external dependencies so it can run immediately after git clone.
 */

const { execSync, spawn } = require('child_process');

// ANSI Escapes for pretty UI
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
    clear: '\x1b[2J\x1b[0f',
};

console.log(c.clear);
console.log(`${c.bold}${c.cyan}==========================================${c.reset}`);
console.log(`${c.bold}${c.green}  Agent Studio Enterprise Initialization  ${c.reset}`);
console.log(`${c.bold}${c.cyan}==========================================${c.reset}\n`);

// 1. Diagnostics & Pre-requisite Checks
console.log(`${c.bold}${c.blue}>> Phase 1: Environment Diagnostics${c.reset}`);

// Check Node Version
const nodeVer = process.version;
const minorNode = parseInt(nodeVer.split('.')[1], 10);
const majorNode = parseInt(nodeVer.slice(1).split('.')[0], 10);

if (majorNode < 22 || (majorNode === 22 && minorNode < 5)) {
    console.log(`${c.red}✖ Setup requires Node.js >= 22.5.0 (Current: ${nodeVer})${c.reset}`);
    process.exit(1);
} else {
    console.log(` ${c.green}✔ Node.js version OK (${nodeVer})${c.reset}`);
}

// Check pnpm
try {
    execSync('pnpm --version', { shell: true, stdio: 'pipe' });
    console.log(` ${c.green}✔ pnpm package manager found${c.reset}`);
} catch (_e) {
    console.log(` ${c.yellow}⚠ pnpm not found. Attempting to install via corepack...${c.reset}`);
    try {
        execSync('corepack enable && corepack prepare pnpm@latest --activate', { shell: true, stdio: 'inherit' });
        console.log(` ${c.green}✔ pnpm installed successfully${c.reset}`);
    } catch (_err) {
        console.log(`${c.red}✖ Failed to install pnpm. Please install it manually: npm install -g pnpm${c.reset}`);
        process.exit(1);
    }
}

console.log('');
console.log(`${c.gray}WSL / Windows: Agent Studio runs seamlessly on Windows PowerShell or WSL.${c.reset}`);
console.log(`${c.gray}CUDA / GPUs: Nvidia CUDA Toolkit 13.x is OPTIONAL but recommended for ~40% faster code indexing.${c.reset}\n`);

// 2. Setup Pipeline Definition
const steps = [
    { name: 'Enable Git Optimizations', cmd: 'git config --local core.untrackedCache true && git config --local core.fsmonitor true', est: '1s' },
    { name: 'Install Dependencies', cmd: 'pnpm install', est: '30-60s' },
    { name: 'Initialize SQLite Memory & Context', cmd: 'pnpm memory:init', est: '2s' },
    { name: 'Compile Agent Registry', cmd: 'pnpm agents:registry', est: '2s' },
    { name: 'Generate Routing Prototypes', cmd: 'pnpm routing:prototypes', est: '2s' },
    { name: 'Compile Skills Catalog', cmd: 'pnpm agents:catalog', est: '1s' },
    { name: 'Build Hybrid Search Vector Index', cmd: 'pnpm code:index:reindex', est: '12-17m' }
];

console.log(`${c.bold}${c.blue}>> Phase 2: Orchestrated Setup Workflow${c.reset}`);

function runStep(step, index) {
    console.log(`\n${c.bold}[${index + 1}/${steps.length}] ${step.name}${c.reset} ${c.gray}(Est: ${step.est})${c.reset}`);

    return new Promise((resolve, reject) => {
        // For long running indexing step or install, pipe stdout to show progress instead of a silent hang
        const isVerbose = step.name.includes('Install') || step.name.includes('Index');

        const proc = spawn(step.cmd, {
            shell: true,
            stdio: isVerbose ? 'inherit' : 'ignore'
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log(` ${c.green}✔ ${step.name} Complete${c.reset}`);
                resolve();
            } else {
                console.log(` ${c.red}✖ Process failed with exit code ${code}${c.reset}`);
                reject(new Error(`Failed on step: ${step.name}`));
            }
        });
    });
}

async function runAll() {
    const startTime = Date.now();
    for (let i = 0; i < steps.length; i++) {
        try {
            await runStep(steps[i], i);
        } catch (_err) {
            console.log(`\n${c.red}${c.bold}Setup aborted due to errors. Review logs above.${c.reset}`);
            process.exit(1);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n${c.bold}${c.green}==========================================${c.reset}`);
    console.log(`${c.bold}${c.green}✨ Initialization Complete in ${elapsed} mins! ✨${c.reset}`);
    console.log(`${c.bold}${c.green}==========================================${c.reset}\n`);

    console.log(`${c.bold}Next Steps:${c.reset}`);
    console.log(`1. Your environment is fully configured and hybrid vector search is armed.`);
    console.log(`2. Verify the framework health: ${c.cyan}pnpm validate:full${c.reset}`);
    console.log(`3. Spawn an agent: ${c.cyan}claude -p "Implement the user auth API"${c.reset}\n`);
}

runAll();
