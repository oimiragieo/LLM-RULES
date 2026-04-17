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

module.exports = {
  resolveDomainSpecialist,
};
