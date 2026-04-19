import { relative, resolve } from 'path';

function hasTraversalSegment(targetArg) {
  if (!targetArg) return false;
  return String(targetArg)
    .split(/[\\/]+/)
    .some(segment => segment === '..');
}

export function validateInstallTarget({ targetArg, cwd = process.cwd(), force = false } = {}) {
  const resolvedCwd = resolve(cwd);
  const targetDir = targetArg ? resolve(targetArg) : resolvedCwd;

  if (hasTraversalSegment(targetArg)) {
    throw new Error('Target directory cannot contain ".." (path traversal detected)');
  }

  const relativeTarget = relative(resolvedCwd, targetDir);
  const isOutsideCwd =
    relativeTarget !== '' &&
    (relativeTarget.startsWith('..') || resolve(resolvedCwd, relativeTarget) !== targetDir);

  if (isOutsideCwd && !force) {
    throw new Error(
      'Target directory is outside current working directory. Use --force to confirm installation to external directory'
    );
  }

  return targetDir;
}
