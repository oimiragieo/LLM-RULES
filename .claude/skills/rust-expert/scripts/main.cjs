'use strict';

/**
 * rust-expert skill CLI
 * Domain-aware Rust project analyzer and validator.
 *
 * Usage:
 *   node main.cjs --help
 *   node main.cjs --validate <file_or_dir>
 *   node main.cjs --analyze <file_or_dir>
 */

const fs = require('fs');
const path = require('path');

// ─── Anti-pattern detection ───────────────────────────────────────────────────

const ANTI_PATTERNS = [
  {
    id: 'unwrap-in-lib',
    pattern: /\.unwrap\(\)/g,
    message: '.unwrap() found — use ? or .expect() with a clear message in lib code',
    severity: 'error',
    context: 'library',
  },
  {
    id: 'clone-in-loop',
    // Heuristic: .clone() inside a for/while block
    pattern: /(?:for|while)[^{]*\{[^}]*\.clone\(\)/gs,
    message: '.clone() inside a loop — consider borrowing or pre-cloning outside the loop',
    severity: 'warning',
    context: 'both',
  },
  {
    id: 'blocking-in-async',
    pattern: /(?:std::thread::sleep|std::fs::read|std::net::TcpStream::connect)/g,
    message: 'Blocking call detected inside async context — use tokio equivalents',
    severity: 'error',
    context: 'async',
  },
  {
    id: 'mutex-guard-across-await',
    pattern: /std::sync::Mutex/g,
    message: 'std::sync::Mutex may be held across .await — use tokio::sync::Mutex in async code',
    severity: 'warning',
    context: 'async',
  },
  {
    id: 'unbounded-channel',
    pattern: /(?:mpsc::channel\(\)|channel::<[^>]*>\(\))\s*(?!;)/g,
    message: 'Unbounded channel — consider bounded mpsc::channel(capacity) to apply back-pressure',
    severity: 'warning',
    context: 'both',
  },
  {
    id: 'non-idiomatic-error',
    pattern: /Box<dyn\s+(?:std::)?error::Error>/g,
    message:
      'Box<dyn Error> in library code — prefer typed errors via thiserror for composable APIs',
    severity: 'warning',
    context: 'library',
  },
];

// ─── Dependency & edition detection ──────────────────────────────────────────

function detectEdition(cargoToml) {
  const match = cargoToml.match(/edition\s*=\s*"(\d{4})"/);
  return match ? match[1] : 'unknown';
}

function detectAsyncRuntime(cargoToml) {
  if (/tokio/.test(cargoToml)) return 'tokio';
  if (/async-std/.test(cargoToml)) return 'async-std';
  if (/smol/.test(cargoToml)) return 'smol';
  return 'none';
}

function detectKeyDependencies(cargoToml) {
  const deps = [];
  const interestingCrates = [
    'serde',
    'tokio',
    'async-std',
    'axum',
    'actix-web',
    'warp',
    'hyper',
    'reqwest',
    'sqlx',
    'diesel',
    'thiserror',
    'anyhow',
    'tracing',
    'log',
    'rayon',
    'clap',
    'structopt',
    'proptest',
    'criterion',
    'nextest',
  ];
  for (const crate of interestingCrates) {
    const re = new RegExp(`\\b${crate}\\b`);
    if (re.test(cargoToml)) deps.push(crate);
  }
  return deps;
}

// ─── Validate command ─────────────────────────────────────────────────────────

function validate(target) {
  const results = { target, issues: [], warnings: [], ok: true };

  const files = collectRustFiles(target);
  if (files.length === 0) {
    results.issues.push(`No .rs files found at: ${target}`);
    results.ok = false;
    return results;
  }

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const isLib = path.basename(file) === 'lib.rs' || file.includes(`${path.sep}lib${path.sep}`);

    for (const ap of ANTI_PATTERNS) {
      if (ap.context === 'library' && !isLib) continue;
      if (ap.pattern.test(src)) {
        const entry = { file, id: ap.id, message: ap.message };
        if (ap.severity === 'error') {
          results.issues.push(entry);
          results.ok = false;
        } else {
          results.warnings.push(entry);
        }
      }
      ap.pattern.lastIndex = 0; // reset stateful regex
    }
  }

  return results;
}

// ─── Analyze command ──────────────────────────────────────────────────────────

function analyze(target) {
  const result = { target, edition: 'unknown', asyncRuntime: 'none', dependencies: [] };

  const cargoPath = findCargoToml(target);
  if (cargoPath) {
    const cargoToml = fs.readFileSync(cargoPath, 'utf8');
    result.edition = detectEdition(cargoToml);
    result.asyncRuntime = detectAsyncRuntime(cargoToml);
    result.dependencies = detectKeyDependencies(cargoToml);
  } else {
    result.warning = 'No Cargo.toml found — edition and dependency analysis skipped';
  }

  return result;
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function collectRustFiles(target) {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return target.endsWith('.rs') ? [target] : [];
  const files = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory() && entry.name !== 'target' && entry.name !== '.git') {
      files.push(...collectRustFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      files.push(full);
    }
  }
  return files;
}

function findCargoToml(startDir) {
  let dir = fs.statSync(startDir).isFile() ? path.dirname(startDir) : startDir;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'Cargo.toml');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

function printHelp() {
  process.stdout.write(`rust-expert skill CLI

USAGE:
  node main.cjs --help
  node main.cjs --validate <path>   Check a Rust file or project for anti-patterns
  node main.cjs --analyze  <path>   Report edition, async runtime, key dependencies

OPTIONS:
  --validate <path>   Validate Rust source for common anti-patterns:
                        - .unwrap() in lib code
                        - .clone() in hot loops
                        - blocking calls in async context
                        - non-idiomatic error types

  --analyze  <path>   Static analysis of project metadata:
                        - Rust edition (2021 / 2024)
                        - Async runtime (tokio / async-std / none)
                        - Key crates detected in Cargo.toml

  --help              Show this help text

EXAMPLES:
  node main.cjs --validate src/lib.rs
  node main.cjs --validate /path/to/my-crate
  node main.cjs --analyze  /path/to/my-crate
`);
}

function main(input = {}) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    printHelp();
    return { ok: true, skill: 'rust-expert' };
  }

  const validateIdx = args.indexOf('--validate');
  if (validateIdx !== -1) {
    const target = args[validateIdx + 1];
    if (!target) {
      process.stderr.write('Error: --validate requires a path argument\n');
      process.exit(1);
    }
    const result = validate(target);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!result.ok) process.exit(1);
    return result;
  }

  const analyzeIdx = args.indexOf('--analyze');
  if (analyzeIdx !== -1) {
    const target = args[analyzeIdx + 1];
    if (!target) {
      process.stderr.write('Error: --analyze requires a path argument\n');
      process.exit(1);
    }
    const result = analyze(target);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result;
  }

  // Called programmatically with an input object
  if (input.validate) return validate(input.validate);
  if (input.analyze) return analyze(input.analyze);

  printHelp();
  return { ok: true, skill: 'rust-expert', input };
}

module.exports = { main, validate, analyze };

if (require.main === module) {
  main();
}
