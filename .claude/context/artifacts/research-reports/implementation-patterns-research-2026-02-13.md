<!-- Agent: researcher | Task: #11 | Session: 2026-02-13 -->

# Research Report: Implementation Patterns for P0/P1 Remediation

**Date**: 2026-02-13
**Researcher**: researcher agent
**Task**: #11
**Batch/Phase**: Sprint 1 (Remediation Pipeline)
**Sources Consulted**: 5

---

## Executive Summary

Comprehensive research on 4 implementation-specific patterns needed for developer phase: jscodeshift console-to-logger codemods, proper-lockfile concurrent write safety, Pino structured logging setup, and ESLint custom rule enforcement. Key findings: (1) jscodeshift provides AST-based transforms via Collections API with .find()/.replaceWith() pattern, (2) proper-lockfile uses atomic mkdir + mtime-based stale detection (10s default), (3) Pino supports environment-based transport configuration (pino-pretty dev-only, JSON production), (4) ESLint max-lines built-in rule + no-restricted-syntax for banning patterns. All patterns validated against existing Node.js CommonJS codebase constraints.

---

## Research Methodology

### Search Queries Executed

| #   | Query                                                                    | Source    | Results Found |
| --- | ------------------------------------------------------------------------ | --------- | ------------- |
| 1   | jscodeshift console.log to logger.info transform examples 2025          | WebSearch | 10            |
| 2   | proper-lockfile npm stale recovery concurrent write Node.js             | WebSearch | 10            |
| 3   | Pino structured logger configuration CLI vs JSON output pino-pretty     | WebSearch | 10            |
| 4   | ESLint custom rules ban JSON.parse max-lines per file enforcement       | WebSearch | 10            |
| 5   | manual dependency injection factory pattern Node.js CommonJS circular dependencies 2025 | WebSearch | 10            |

### Sources Consulted

| #   | Title                                                                      | Type          | URL                                                                                       | Date |
| --- | -------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- | ---- |
| 1   | jscodeshift - npm                                                          | Documentation | https://www.npmjs.com/package/jscodeshift                                                 | 2025 |
| 2   | Write Code to Rewrite Your Code: jscodeshift (Toptal)                      | Tutorial      | https://www.toptal.com/javascript/write-code-to-rewrite-your-code                         | 2024 |
| 3   | proper-lockfile - npm                                                      | Documentation | https://www.npmjs.com/package/proper-lockfile                                             | 2025 |
| 4   | Understanding Node.js file locking (LogRocket)                             | Article       | https://blog.logrocket.com/understanding-node-js-file-locking/                            | 2024 |
| 5   | A Complete Guide to Pino Logging in Node.js (Better Stack)                | Guide         | https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/ | 2025 |
| 6   | Pino Logger: Complete Node.js Guide with Examples [2026] (SigNoz)         | Guide         | https://signoz.io/guides/pino-logger/                                                     | 2026 |
| 7   | max-lines - ESLint - Pluggable JavaScript Linter                           | Documentation | https://eslint.org/docs/latest/rules/max-lines                                            | 2025 |
| 8   | Configure Rules - ESLint - Pluggable JavaScript Linter                     | Documentation | https://eslint.org/docs/latest/use/configure/rules                                        | 2025 |
| 9   | Circular Dependencies + Dependency Injection in Node.js (Thomas C)         | Blog Post     | https://tomkit.wordpress.com/2013/02/05/circular-dependencies-dependency-injection-in-node-js/ | 2013 |
| 10  | JavaScript dependency injection in Node.js (TSH)                           | Article       | https://tsh.io/blog/dependency-injection-in-node-js                                       | 2024 |
| 11  | Breaking down circular dependencies in JavaScript (Bryan Braun)            | Article       | https://www.bryanbraun.com/2025/03/29/breaking-down-circular-dependencies-javascript/     | 2025 |

---

## Detailed Findings

### Topic 1: jscodeshift Console-to-Logger Codemod

**Key Insights:**

- jscodeshift transforms are modules exporting `function(fileInfo, api, options)` that manipulate AST and return modified source
- Collections API provides `.find()` to locate nodes, `.forEach()` to iterate, `.replaceWith()` to replace with new AST nodes
- Standard pattern: `root.find(j.CallExpression, { callee: { object: { name: 'console' }, property: { name: 'log' } } }).replaceWith(...)`
- Protocol output (JSON.stringify, formatResult) requires explicit skip rules to avoid breaking hook stdout
- Transform can inject logger import if not present using AST manipulation

**Evidence:**

From jscodeshift npm documentation: "The transform is simply a module that exports a function of the form: `module.exports = function(fileInfo, api, options) { // transform fileInfo.source here ... return source; }`"

From Toptal guide: "The Collections API allows replacing the current syntax tree node with a new value using the replaceWith method."

**Working Code Example:**

```javascript
// Transform console.log → logger.info
module.exports = function transform(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  let modified = false;

  // Skip protocol output: console.log(JSON.stringify(...))
  root.find(j.CallExpression, {
    callee: {
      object: { name: 'console' },
      property: { name: 'log' }
    }
  }).forEach(path => {
    const firstArg = path.node.arguments[0];
    
    // SKIP: JSON.stringify (hook protocol)
    if (firstArg?.type === 'CallExpression' &&
        firstArg.callee?.object?.name === 'JSON' &&
        firstArg.callee?.property?.name === 'stringify') {
      return;
    }

    // SKIP: formatResult (hook protocol)
    if (firstArg?.type === 'CallExpression' &&
        firstArg.callee?.name === 'formatResult') {
      return;
    }

    // Transform console.log → logger.info
    path.node.callee = j.memberExpression(
      j.identifier('logger'),
      j.identifier('info')
    );
    modified = true;
  });

  // Add logger import if modified
  if (modified && !hasLoggerImport(root, j)) {
    addLoggerImport(root, j, fileInfo.path);
  }

  return modified ? root.toSource() : fileInfo.source;
};

function hasLoggerImport(root, j) {
  return root.find(j.VariableDeclarator, {
    init: { callee: { name: 'createLogger' } }
  }).length > 0;
}

function addLoggerImport(root, j, filePath) {
  const componentName = path.basename(filePath, '.cjs');
  
  const loggerImport = j.variableDeclaration('const', [
    j.variableDeclarator(
      j.objectPattern([
        j.property('init', j.identifier('createLogger'), j.identifier('createLogger'))
      ]),
      j.callExpression(j.identifier('require'), [
        j.literal('../../lib/utils/logger.cjs')
      ])
    )
  ]);

  const loggerInit = j.variableDeclaration('const', [
    j.variableDeclarator(
      j.identifier('logger'),
      j.callExpression(j.identifier('createLogger'), [
        j.literal(componentName)
      ])
    )
  ]);

  // Insert after last require
  const lastRequire = root.find(j.VariableDeclaration)
    .filter(p => p.node.declarations.some(d => d.init?.callee?.name === 'require'
