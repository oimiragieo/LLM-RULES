/**
 * Pure argument parser for ask-gemini.mjs.
 * Uses node:util parseArgs for POSIX-compliant, order-independent flag handling.
 * Exported for unit testing without spawning a process.
 */
import { parseArgs as nodeParseArgs } from 'node:util';

/**
 * Parse CLI argv into structured options.
 * Flags may appear before or after the prompt — both are handled correctly.
 *
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ prompt: string, model: string, outputJson: boolean, sandbox: boolean }}
 */
export function parseArgs(argv) {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    options: {
      model: { type: 'string', short: 'm', default: '' },
      json: { type: 'boolean', default: false },
      sandbox: { type: 'boolean', short: 's', default: false },
    },
    allowPositionals: true,
    strict: false, // tolerate unknown flags so prompts like "- list files" don't throw
  });

  return {
    prompt: positionals.join(' '),
    // util.parseArgs returns true (not a string) for --model with no value in non-strict mode
    model: typeof values.model === 'string' ? values.model : '',
    outputJson: values.json ?? false,
    sandbox: values.sandbox ?? false,
  };
}
