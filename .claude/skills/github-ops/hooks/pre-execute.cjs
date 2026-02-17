'use strict';

module.exports = function preExecute(input) {
  const { command, args } = input;

  // Platform safety: block Linux-specific constructs on Windows
  if (process.platform === 'win32') {
    const fullCommand = `${command} ${args ? args.join(' ') : ''}`;
    if (fullCommand.includes('/dev/stdin') || fullCommand.includes('/tmp/')) {
      return {
        allow: false,
        message: '[github-ops] Linux-specific path constructs detected in Windows environment.',
      };
    }
  }

  return { allow: true };
};
