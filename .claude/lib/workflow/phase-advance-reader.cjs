'use strict';

const DOMAIN_SPECIALIST_PATTERNS = Object.freeze([
  { agent: 'nextjs-pro', signals: ['next.js', 'nextjs', 'server components', 'app router'] },
  { agent: 'fastapi-pro', signals: ['fastapi', 'pydantic', 'starlette', 'asgi'] },
  { agent: 'python-pro', signals: ['django', 'drf', 'python', 'asyncio', 'pandas'] },
  { agent: 'typescript-pro', signals: ['typescript', 'strict types', 'tsconfig', '.ts'] },
  { agent: 'golang-pro', signals: ['golang', 'go microservice', 'protobuf', 'go.mod', 'grpc'] },
  { agent: 'rust-pro', signals: ['rust', 'tokio', 'cargo', 'ownership', 'lifetimes'] },
  { agent: 'java-pro', signals: ['spring boot', 'spring mvc', 'java', 'maven', 'gradle', 'jvm'] },
  { agent: 'php-pro', signals: ['laravel', 'symfony', 'composer', 'php'] },
  { agent: 'nodejs-pro', signals: ['nestjs', 'express', 'node.js', 'nodejs'] },
  { agent: 'sveltekit-expert', signals: ['sveltekit', 'svelte', 'ssr'] },
  { agent: 'graphql-pro', signals: ['graphql', 'apollo', 'resolvers', 'schema stitching'] },
  { agent: 'ios-pro', signals: ['swiftui', 'ios', 'xcode', 'iphone', 'ipad'] },
  {
    agent: 'android-pro',
    signals: ['jetpack compose', 'android', 'viewmodel', 'androidx', 'kotlin'],
  },
  { agent: 'expo-mobile-developer', signals: ['react native', 'expo'] },
  { agent: 'tauri-desktop-developer', signals: ['tauri', 'desktop application', 'desktop app'] },
  { agent: 'frontend-pro', signals: ['react', 'vue', 'hooks', 'composition api', 'tailwind'] },
  {
    agent: 'ai-ml-specialist',
    signals: ['pytorch', 'tensorflow', 'machine learning', 'train model', 'deep learning'],
  },
  {
    agent: 'data-engineer',
    signals: ['etl', 'apache spark', 'data pipeline', 'data warehouse', 'feature pipeline'],
  },
  { agent: 'web3-blockchain-expert', signals: ['solidity', 'smart contract', 'defi', 'web3'] },
  { agent: 'gamedev-pro', signals: ['unity', 'game physics', 'gamedev'] },
  {
    agent: 'scientific-research-expert',
    signals: ['genomics', 'variant calling', 'scientific workflow'],
  },
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function signalMatches(promptLower, signal) {
  const normalizedSignal = String(signal || '')
    .trim()
    .toLowerCase();
  if (!normalizedSignal) {
    return false;
  }

  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedSignal)}([^a-z0-9]|$)`, 'i');
  return pattern.test(promptLower);
}

function resolveDomainSpecialist(context) {
  if (typeof context !== 'string' || !context.trim()) {
    return null;
  }

  const promptLower = context.toLowerCase();

  for (const candidate of DOMAIN_SPECIALIST_PATTERNS) {
    if (candidate.signals.some(signal => signalMatches(promptLower, signal))) {
      return candidate.agent;
    }
  }

  return null;
}

/**
 * Flat list of all signals across DOMAIN_SPECIALIST_PATTERNS.
 * Used by routing-guard Check 7 second-pass negation guard.
 */
const DOMAIN_SPECIALIST_SIGNALS_FLAT = Object.freeze(
  DOMAIN_SPECIALIST_PATTERNS.flatMap(p => p.signals)
);

/**
 * Returns true if any of the given signals appear in `text` with a negation
 * token within 50 characters before the signal. Used to suppress false-positive
 * domain specialist warnings for prompts like "do NOT use Rust here".
 *
 * @param {string} text - The combined prompt+description text (lowercased or not)
 * @param {readonly string[]} signals - Signal list to check (defaults to DOMAIN_SPECIALIST_SIGNALS_FLAT)
 * @returns {boolean}
 */
function hasNegationNearSignal(text, signals = DOMAIN_SPECIALIST_SIGNALS_FLAT) {
  const NEGATION = /(?:\b(?:do\s+not|don['’]t|avoid|without|no|never|not)\b)/i;
  const lower = text.toLowerCase();
  for (const sig of signals) {
    const idx = lower.indexOf(sig.toLowerCase());
    if (idx === -1) continue;
    const window = lower.slice(Math.max(0, idx - 50), idx);
    if (NEGATION.test(window)) return true;
  }
  return false;
}

module.exports = {
  resolveDomainSpecialist,
  hasNegationNearSignal,
  DOMAIN_SPECIALIST_SIGNALS_FLAT,
};
