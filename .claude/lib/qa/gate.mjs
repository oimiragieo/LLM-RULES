import { existsSync } from 'fs';
import { resolve } from 'path';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function evaluateGateContext(context = {}) {
  const input = context && typeof context === 'object' ? context : {};
  const errors = [];

  if (input.status === 'failed') {
    errors.push('Context status is failed');
  }

  const checks = input.checks && typeof input.checks === 'object' ? input.checks : {};
  for (const checkName of toArray(input.mustPassChecks)) {
    if (checks[checkName] !== true) {
      errors.push(`Required check failed or missing: ${checkName}`);
    }
  }

  const projectRoot = String(input.projectRoot || process.cwd());
  for (const artifactPath of toArray(input.requiredArtifacts)) {
    const full = resolve(projectRoot, String(artifactPath));
    if (!existsSync(full)) {
      errors.push(`Required artifact missing: ${artifactPath}`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

export const gate = async context => {
  return evaluateGateContext(context).passed;
};
