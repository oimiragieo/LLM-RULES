#!/usr/bin/env node
/**
 * Agent Studio Setup UX Wizard
 * Solves the barrier to entry by bundling all setup commands into one smooth UI flow.
 * Note: Uses NO external dependencies so it can run immediately after git clone.
 */

const { execFileSync, spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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
  execFileSync('pnpm', ['--version'], { shell: false, stdio: 'pipe' });
  console.log(` ${c.green}✔ pnpm package manager found${c.reset}`);
} catch (_e) {
  console.log(` ${c.yellow}⚠ pnpm not found. Attempting to install via corepack...${c.reset}`);
  try {
    execFileSync('corepack', ['enable'], { shell: false, stdio: 'inherit' });
    execFileSync('corepack', ['prepare', 'pnpm@latest', '--activate'], {
      shell: false,
      stdio: 'inherit',
    });
    console.log(` ${c.green}✔ pnpm installed successfully${c.reset}`);
  } catch (_err) {
    console.log(
      `${c.red}✖ Failed to install pnpm. Please install it manually: npm install -g pnpm${c.reset}`
    );
    process.exit(1);
  }
}

// Optional Tool Detection
console.log(`\n${c.bold}${c.blue}>> Optional Tool Detection${c.reset}`);

/**
 * Probe for a CLI tool by running it with a version flag.
 * Returns { found: boolean, version?: string }.
 */
function detectTool(cmd, args) {
  try {
    const result = spawnSync(cmd, args, { shell: false, stdio: 'pipe', timeout: 5000 });
    if (result.status === 0 && result.stdout) {
      const ver = result.stdout.toString().trim().split('\n')[0];
      return { found: true, version: ver };
    }
    return { found: false };
  } catch (_e) {
    return { found: false };
  }
}

const optionalTools = [
  { name: 'pyright', cmd: 'pyright', args: ['--version'], hint: 'pip install pyright' },
  {
    name: 'gopls',
    cmd: 'gopls',
    args: ['version'],
    hint: 'go install golang.org/x/tools/gopls@latest',
  },
  {
    name: 'rust-analyzer',
    cmd: 'rust-analyzer',
    args: ['--version'],
    hint: 'rustup component add rust-analyzer',
  },
];

// External LLM CLIs — detect by checking sibling project directories
const projectRoot = path.resolve(__dirname, '..', '..');
const externalClis = [
  { name: 'gemini-cli', dir: path.join(projectRoot, 'omega-gemini-cli') },
  { name: 'codex-cli', dir: path.join(projectRoot, 'omega-codex-cli') },
  { name: 'cursor-cli', dir: path.join(projectRoot, 'omega-cursor-cli') },
];

for (const tool of optionalTools) {
  const result = detectTool(tool.cmd, tool.args);
  if (result.found) {
    console.log(` ${c.green}✔ ${tool.name} found (${result.version})${c.reset}`);
  } else {
    console.log(` ${c.gray}○ ${tool.name} not found — install with: ${tool.hint}${c.reset}`);
  }
}

for (const cli of externalClis) {
  if (fs.existsSync(cli.dir)) {
    console.log(` ${c.green}✔ ${cli.name} project found${c.reset}`);
  } else {
    console.log(` ${c.gray}○ ${cli.name} not found at ${cli.dir}${c.reset}`);
  }
}

console.log('');
console.log(
  `${c.gray}WSL / Windows: Agent Studio runs seamlessly on Windows PowerShell or WSL.${c.reset}`
);
console.log(
  `${c.gray}CUDA / GPUs: Nvidia CUDA Toolkit 13.x is OPTIONAL but recommended for ~40% faster code indexing.${c.reset}\n`
);

// 2. Environment Configuration (.env wizard)
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');
const skipEnv = process.argv.includes('--skip-env') || process.env.CI === 'true';

/**
 * Interactive .env setup wizard.
 * Copies .env.example and prompts for user-facing API keys.
 * Uses Node.js readline (zero external deps).
 */
async function runEnvWizard() {
  if (skipEnv) {
    console.log(` ${c.gray}○ .env wizard skipped (--skip-env or CI mode)${c.reset}`);
    return;
  }

  if (fs.existsSync(envPath)) {
    console.log(` ${c.green}✔ .env file already exists — skipping wizard${c.reset}`);
    return;
  }

  if (!fs.existsSync(envExamplePath)) {
    console.log(` ${c.yellow}⚠ .env.example not found — cannot create .env${c.reset}`);
    return;
  }

  console.log(`\n${c.bold}${c.blue}>> Phase 2: Environment Configuration${c.reset}`);
  console.log(` ${c.cyan}Creating .env from .env.example...${c.reset}`);

  // Copy the example file as the base
  let envContent = fs.readFileSync(envExamplePath, 'utf8');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function ask(question) {
    return new Promise(resolve => {
      rl.question(question, answer => resolve(answer.trim()));
    });
  }

  /**
   * Replace a commented-out env var line with an uncommented, populated one.
   * Handles both "# VAR=value" and "# VAR=" forms.
   */
  function setEnvVar(content, varName, value) {
    if (!value) return content;
    // Match commented or uncommented forms
    const patterns = [new RegExp(`^#\\s*${varName}=.*$`, 'm'), new RegExp(`^${varName}=.*$`, 'm')];
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return content.replace(pattern, `${varName}=${value}`);
      }
    }
    // If not found at all, append
    return content + `\n${varName}=${value}\n`;
  }

  function maskKey(key) {
    if (!key || key.length < 8) return '****';
    return '****' + key.slice(-4);
  }

  try {
    // Required: Anthropic API Key
    // security-lint-disable SEC-030 — setup wizard UX messages, values are masked via maskKey()
    console.log(`\n${c.bold}Required API Keys:${c.reset}`);
    const anthropicKey = await ask(
      ` ${c.cyan}Anthropic API key (starts with sk-ant-, press Enter to skip): ${c.reset}`
    );
    if (anthropicKey) {
      if (!anthropicKey.startsWith('sk-ant-')) {
        console.log(` ${c.yellow}⚠ Key does not start with sk-ant- — saving anyway${c.reset}`);
      }
      envContent = setEnvVar(envContent, 'ANTHROPIC_API_KEY', anthropicKey);
      console.log(` ${c.green}✔ ANTHROPIC_API_KEY set (${maskKey(anthropicKey)})${c.reset}`);
    }

    // Optional integrations
    const configExtras = await ask(
      `\n ${c.cyan}Configure optional integrations? (y/N): ${c.reset}`
    );

    if (configExtras.toLowerCase() === 'y') {
      const optionalKeys = [
        {
          name: 'OPENAI_API_KEY',
          prompt: 'OpenAI API key (for Codex integration, optional)',
          prefix: 'sk-',
        },
        { name: 'EXA_API_KEY', prompt: 'Exa API key (for research/search, optional)' },
        { name: 'HF_TOKEN', prompt: 'HuggingFace token (for embeddings, optional)', prefix: 'hf_' },
        { name: 'ELEVENLABS_API_KEY', prompt: 'ElevenLabs key (for voice, optional)' },
        { name: 'GEMINI_API_KEY', prompt: 'Gemini API key (optional)' },
      ];

      console.log(`\n${c.bold}Optional Integration Keys:${c.reset}`);
      for (const keyDef of optionalKeys) {
        const value = await ask(` ${c.cyan}${keyDef.prompt} (Enter to skip): ${c.reset}`);
        if (!value) continue;
        const hasBadPrefix = keyDef.prefix && !value.startsWith(keyDef.prefix);
        if (hasBadPrefix) {
          console.log(` ${c.yellow}⚠ Expected prefix "${keyDef.prefix}" — saving anyway${c.reset}`);
        }
        envContent = setEnvVar(envContent, keyDef.name, value);
        console.log(` ${c.green}✔ ${keyDef.name} set (${maskKey(value)})${c.reset}`);
      }
    }

    // Telegram channel
    const configTelegram = await ask(`\n ${c.cyan}Configure Telegram channel? (y/N): ${c.reset}`);

    if (configTelegram.toLowerCase() === 'y') {
      const botToken = await ask(` ${c.cyan}Telegram bot token: ${c.reset}`);
      if (botToken) {
        envContent = setEnvVar(envContent, 'TELEGRAM_BOT_TOKEN', botToken);
        console.log(` ${c.green}✔ TELEGRAM_BOT_TOKEN set (${maskKey(botToken)})${c.reset}`);
      }
    }

    // Write the .env file
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`\n ${c.green}✔ .env file created successfully${c.reset}`);
  } finally {
    rl.close();
  }
}

// 3. Setup Pipeline Definition
// Each step has either cmd+args (array form, shell:false) or cmds (sequential commands, no &&)
const steps = [
  {
    name: 'Enable Git Optimizations',
    // Two sequential git config calls — split to avoid shell:true with &&
    cmds: [
      ['git', ['config', '--local', 'core.untrackedCache', 'true']],
      ['git', ['config', '--local', 'core.fsmonitor', 'true']],
    ],
    est: '1s',
  },
  { name: 'Install Dependencies', cmd: 'pnpm', args: ['install'], est: '30-60s' },
  { name: 'Initialize SQLite Memory & Context', cmd: 'pnpm', args: ['memory:init'], est: '2s' },
  { name: 'Compile Agent Registry', cmd: 'pnpm', args: ['agents:registry'], est: '2s' },
  { name: 'Generate Routing Prototypes', cmd: 'pnpm', args: ['routing:prototypes'], est: '2s' },
  { name: 'Compile Skills Catalog', cmd: 'pnpm', args: ['agents:catalog'], est: '1s' },
  {
    name: 'Build Hybrid Search Vector Index',
    cmd: 'pnpm',
    args: ['code:index:reindex'],
    est: '12-17m',
  },
  { name: 'Validate Framework Health', cmd: 'pnpm', args: ['validate'], est: '5-10s' },
];

console.log(`${c.bold}${c.blue}>> Phase 3: Orchestrated Setup Workflow${c.reset}`);

function runStep(step, index) {
  console.log(
    `\n${c.bold}[${index + 1}/${steps.length}] ${step.name}${c.reset} ${c.gray}(Est: ${step.est})${c.reset}`
  );

  return new Promise((resolve, reject) => {
    // For long running indexing step or install, pipe stdout to show progress instead of a silent hang
    const isVerbose = step.name.includes('Install') || step.name.includes('Index');

    // Sequential multi-command step (uses array args, shell:false)
    if (step.cmds) {
      try {
        for (const [cmd, args] of step.cmds) {
          execFileSync(cmd, args, { shell: false, stdio: 'ignore' });
        }
        console.log(` ${c.green}✔ ${step.name} Complete${c.reset}`);
        resolve();
      } catch (err) {
        console.log(` ${c.red}✖ Process failed: ${err.message}${c.reset}`);
        reject(new Error(`Failed on step: ${step.name}`));
      }
      return;
    }

    const proc = spawn(step.cmd, step.args || [], {
      shell: false,
      stdio: isVerbose ? 'inherit' : 'ignore',
    });

    proc.on('close', code => {
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

  // Run the .env wizard before the pipeline steps
  await runEnvWizard();

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
