# Phase 1: Code Indexing System - Detailed Implementation Plan

**Version:** 1.0
**Status:** APPROVED FOR IMPLEMENTATION
**Author:** Planner Agent (Task #36)
**Date:** 2026-01-31
**Parent Documents:**
- `.claude/docs/CODE_INDEXING_DESIGN.md`
- `.claude/docs/CODE_INDEXING_IMPLEMENTATION_ROADMAP.md`
- `.claude/docs/CODE_INDEXING_TECH_STACK.md`

---

## Executive Summary

This plan breaks down Phase 1 (Foundation) of the Code Indexing System into **47 atomic subtasks** across **8 main components**. Each subtask is designed to be completed in under 2 hours, with clear dependencies, verification commands, and success criteria.

| Metric | Value |
|--------|-------|
| **Total Tasks** | 47 atomic subtasks |
| **Total Effort** | ~110-130 hours |
| **Timeline** | 10 work days (~12h/day) |
| **Critical Path** | Setup -> Parser -> Chunker -> Embedder -> VectorDB -> Orchestrator -> CLI -> Tests |
| **Parallel Work** | Parser/Chunker can run after Setup; Embedder/VectorDB can partially parallel |

### Sprint Overview

| Sprint | Days | Focus | Tasks |
|--------|------|-------|-------|
| Sprint 1 | 1-3 | Foundation + Parser | #36, #37 |
| Sprint 2 | 4-6 | Processing Pipeline | #38, #39 |
| Sprint 3 | 7-9 | Integration | #40, #41 |
| Sprint 4 | 10-14 | Deployment + QA | #42, #43 |

---

## Timeline Gantt Chart (ASCII)

```
Day:  1    2    3    4    5    6    7    8    9   10   11   12   13   14
      |----|----|----|----|----|----|----|----|----|----|----|----|----|----|

#36 Setup      [====]
               ^
               |
#37 Parser          [========]
                    ^
                    |
#38 Chunker              [========]
                         |
                         v
#39 Embedder                  [======]  (partial parallel with Chunker)
                              |
                              v
#40 VectorDB                       [======]
                                   |
                                   v
#41 Orchestrator                        [========]
                                        |
                                        v
#42 CLI Tool                                 [======]
                                             |
                                             v
#43 Testing                                       [========]

LEGEND:
[====] = Task duration
   ^   = Dependency start
   v   = Dependency flow
```

### Critical Path Analysis

```
#36 -> #37 -> #38 -> #39 -> #40 -> #41 -> #42 -> #43
 |      |                                    |
 |      |                                    |
 |      +-- Parser must complete before Chunker (needs AST)
 |
 +-- Setup must complete before any coding starts

Parallel Opportunities:
- 38.6-38.9 (Chunker tests) can run while 39.1-39.4 (Embedder setup) starts
- 39.5-39.7 (Embedder tests) can run while 40.1-40.3 (VectorDB setup) starts
```

---

## Detailed Task Breakdown

---

## Task #36: Set Up Dependencies and Project Structure

**Estimated Total Effort:** 4-5 hours
**Dependencies:** None (ENABLER)
**Blocks:** Tasks #37, #38, #39, #40, #41, #42, #43

### 36.1: Install npm packages for code parsing (1 hour)

**Description:** Install tree-sitter and language grammar packages for JS/TS/Python/Go/Rust.

**Subtasks:**
- [ ] Install tree-sitter core: `npm install tree-sitter`
- [ ] Install JavaScript grammar: `npm install tree-sitter-javascript`
- [ ] Install TypeScript grammar: `npm install tree-sitter-typescript`
- [ ] Install Python grammar: `npm install tree-sitter-python`
- [ ] Install Go grammar: `npm install tree-sitter-go`
- [ ] Install Rust grammar: `npm install tree-sitter-rust`

**Command:**
```bash
npm install tree-sitter tree-sitter-javascript tree-sitter-typescript tree-sitter-python tree-sitter-go tree-sitter-rust --save
```

**Verify:**
```bash
npm list tree-sitter tree-sitter-javascript tree-sitter-typescript tree-sitter-python tree-sitter-go tree-sitter-rust 2>&1 | grep -E "(tree-sitter|UNMET)" && echo "Packages installed" || echo "FAILED"
```

**Rollback:**
```bash
npm uninstall tree-sitter tree-sitter-javascript tree-sitter-typescript tree-sitter-python tree-sitter-go tree-sitter-rust
```

**Success Criteria:**
- [ ] All 6 tree-sitter packages appear in package.json dependencies
- [ ] `npm list tree-sitter` shows all packages installed
- [ ] No npm errors during installation

**Notes:**
- tree-sitter has native bindings - may need node-gyp build tools on Windows
- If build fails, try: `npm install --build-from-source`

---

### 36.2: Install npm packages for embeddings (45 min)

**Description:** Install @xenova/transformers for local embedding generation.

**Subtasks:**
- [ ] Install transformers.js: `npm install @xenova/transformers`
- [ ] Verify ONNX runtime is included

**Command:**
```bash
npm install @xenova/transformers --save
```

**Verify:**
```bash
npm list @xenova/transformers && node -e "require('@xenova/transformers'); console.log('OK')"
```

**Rollback:**
```bash
npm uninstall @xenova/transformers
```

**Success Criteria:**
- [ ] @xenova/transformers appears in package.json
- [ ] Basic require() succeeds without errors

---

### 36.3: Install npm packages for vector database (30 min)

**Description:** Install chromadb client (already used by memory system).

**Subtasks:**
- [ ] Verify chromadb already installed (ADR-054)
- [ ] If not, install: `npm install chromadb`

**Command:**
```bash
npm list chromadb || npm install chromadb --save
```

**Verify:**
```bash
npm list chromadb && node -e "const { ChromaClient } = require('chromadb'); console.log('OK')"
```

**Success Criteria:**
- [ ] chromadb appears in package.json
- [ ] ChromaClient can be imported

---

### 36.4: Install npm packages for CLI (30 min)

**Description:** Install CLI utilities for progress reporting and command parsing.

**Subtasks:**
- [ ] Install cli-progress for progress bars
- [ ] Install chalk for colored output
- [ ] Install commander for argument parsing

**Command:**
```bash
npm install cli-progress chalk commander --save
```

**Verify:**
```bash
npm list cli-progress chalk commander
```

**Success Criteria:**
- [ ] All 3 CLI packages installed
- [ ] No peer dependency warnings

---

### 36.5: Install dev dependencies for testing (30 min)

**Description:** Install Jest and testing utilities.

**Subtasks:**
- [ ] Install Jest (if not present): `npm install --save-dev jest`
- [ ] Install @types/node for TypeScript support
- [ ] Verify jest config exists or create one

**Command:**
```bash
npm install --save-dev jest @types/node
```

**Verify:**
```bash
npm list jest && npx jest --version
```

**Success Criteria:**
- [ ] Jest installed as devDependency
- [ ] `npx jest --version` returns version number

---

### 36.6: Create directory structure (15 min)

**Description:** Create all required directories for the code indexing system.

**Subtasks:**
- [ ] Create `.claude/lib/code-indexing/`
- [ ] Create `.claude/tools/cli/` (if not exists)
- [ ] Create `tests/code-indexing/`
- [ ] Create `.claude/context/data/code-index/` (storage)
- [ ] Create `.claude/config/` (if not exists)

**Command:**
```bash
mkdir -p .claude/lib/code-indexing .claude/tools/cli tests/code-indexing .claude/context/data/code-index .claude/config
```

**Verify:**
```bash
ls -la .claude/lib/code-indexing .claude/tools/cli tests/code-indexing .claude/context/data/code-index .claude/config
```

**Success Criteria:**
- [ ] All 5 directories exist
- [ ] Directories are tracked by git (add .gitkeep if empty)

---

### 36.7: Create base configuration file (30 min)

**Description:** Create the code indexing configuration file with all settings.

**File:** `.claude/config/code-index-config.json`

**Content:**
```json
{
  "version": "1.0.0",
  "indexing": {
    "enabled": true,
    "projectRoot": ".",
    "excludePatterns": [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.min.js",
      "**/*.bundle.js",
      "**/*.map",
      "**/package-lock.json",
      "**/yarn.lock",
      "**/pnpm-lock.yaml",
      "**/.claude/context/data/**"
    ],
    "includePatterns": [
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.ts",
      "**/*.tsx",
      "**/*.mts",
      "**/*.cts",
      "**/*.py",
      "**/*.go",
      "**/*.rs"
    ],
    "maxFileSize": 1048576,
    "batchSize": 50,
    "concurrency": 4
  },
  "chunking": {
    "minTokens": 50,
    "maxTokens": 2048,
    "targetTokens": 512,
    "overlapTokens": 50
  },
  "embedding": {
    "provider": "local",
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimensions": 384,
    "batchSize": 100,
    "cacheEnabled": true
  },
  "vectorStore": {
    "persistDirectory": ".claude/context/data/code-index",
    "collectionName": "agent-studio-code",
    "distanceFunction": "cosine"
  },
  "search": {
    "defaultLimit": 10,
    "defaultMinScore": 0.5,
    "maxLimit": 50,
    "includeContext": true,
    "contextLines": 5
  },
  "languages": {
    "javascript": {
      "extensions": [".js", ".mjs", ".cjs"],
      "grammar": "tree-sitter-javascript"
    },
    "typescript": {
      "extensions": [".ts", ".tsx", ".mts", ".cts"],
      "grammar": "tree-sitter-typescript"
    },
    "python": {
      "extensions": [".py"],
      "grammar": "tree-sitter-python"
    },
    "go": {
      "extensions": [".go"],
      "grammar": "tree-sitter-go"
    },
    "rust": {
      "extensions": [".rs"],
      "grammar": "tree-sitter-rust"
    }
  }
}
```

**Verify:**
```bash
node -e "const cfg = require('./.claude/config/code-index-config.json'); console.log(cfg.version)"
```

**Success Criteria:**
- [ ] Config file exists and is valid JSON
- [ ] All required settings present
- [ ] Config loads without errors

---

### 36.8: Create module stub files (30 min)

**Description:** Create stub files for all code indexing modules with basic structure.

**Files to create:**
1. `.claude/lib/code-indexing/index.cjs` - Main entry point
2. `.claude/lib/code-indexing/code-parser.cjs` - tree-sitter wrapper
3. `.claude/lib/code-indexing/semantic-chunker.cjs` - AST to chunks
4. `.claude/lib/code-indexing/embedding-generator.cjs` - Embeddings
5. `.claude/lib/code-indexing/vector-store.cjs` - ChromaDB wrapper
6. `.claude/lib/code-indexing/index-manager.cjs` - Orchestration

**Template for each stub:**
```javascript
/**
 * [Module Name] - [Brief Description]
 *
 * @module code-indexing/[module-name]
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 */

'use strict';

// TODO: Implement [Module Name]

module.exports = {
  // Exports will be added during implementation
};
```

**Verify:**
```bash
ls -la .claude/lib/code-indexing/*.cjs | wc -l  # Should be 6
node -e "require('./.claude/lib/code-indexing/index.cjs'); console.log('OK')"
```

**Success Criteria:**
- [ ] All 6 module files exist
- [ ] All files have valid CommonJS structure
- [ ] Main index.cjs imports without errors

---

### 36.9: Verify all installations (15 min)

**Description:** Run comprehensive verification of all installed packages.

**Command:**
```bash
# Verify all packages
node -e "
const packages = [
  'tree-sitter',
  'tree-sitter-javascript',
  'tree-sitter-typescript',
  'tree-sitter-python',
  'tree-sitter-go',
  'tree-sitter-rust',
  '@xenova/transformers',
  'chromadb',
  'cli-progress',
  'chalk',
  'commander'
];
let allOk = true;
for (const pkg of packages) {
  try {
    require(pkg);
    console.log('OK: ' + pkg);
  } catch (e) {
    console.log('FAIL: ' + pkg + ' - ' + e.message);
    allOk = false;
  }
}
process.exit(allOk ? 0 : 1);
"
```

**Success Criteria:**
- [ ] All 11 packages load successfully
- [ ] No errors in verification output
- [ ] Exit code 0

---

### Task #36 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 36.1 Install parsing packages | 1h | None |
| 36.2 Install embedding packages | 45m | None |
| 36.3 Install vector DB packages | 30m | None |
| 36.4 Install CLI packages | 30m | None |
| 36.5 Install test packages | 30m | None |
| 36.6 Create directories | 15m | None |
| 36.7 Create config file | 30m | 36.6 |
| 36.8 Create module stubs | 30m | 36.6 |
| 36.9 Verify installations | 15m | 36.1-36.5 |
| **Total** | **4.5h** | |

**Verification Gate:**
```bash
# All must pass before proceeding to Task #37
npm list tree-sitter @xenova/transformers chromadb cli-progress chalk commander jest && \
ls -la .claude/lib/code-indexing/*.cjs | wc -l | grep -q "6" && \
node -e "require('./.claude/config/code-index-config.json')" && \
echo "GATE PASSED: Task #36 complete"
```

---

## Task #37: Implement code-parser.cjs (tree-sitter integration)

**Estimated Total Effort:** 12-14 hours
**Dependencies:** Task #36 complete
**Blocks:** Task #38 (Chunker)

### 37.1: Implement CodeParser class skeleton (1.5 hours)

**Description:** Create the basic CodeParser class with constructor and lazy grammar loading.

**File:** `.claude/lib/code-indexing/code-parser.cjs`

**Implementation:**
```javascript
/**
 * Code Parser - tree-sitter wrapper for multi-language parsing
 *
 * @module code-indexing/code-parser
 */

'use strict';

const Parser = require('tree-sitter');
const fs = require('fs').promises;
const path = require('path');

// Language to grammar mapping
const LANGUAGE_GRAMMARS = {
  javascript: 'tree-sitter-javascript',
  typescript: 'tree-sitter-typescript',
  tsx: 'tree-sitter-typescript/tsx',
  python: 'tree-sitter-python',
  go: 'tree-sitter-go',
  rust: 'tree-sitter-rust'
};

// File extension to language mapping
const EXTENSION_MAP = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust'
};

class CodeParser {
  constructor(options = {}) {
    this.options = options;
    this.grammars = new Map();
    this.parsers = new Map();
  }

  // Methods to implement in subsequent subtasks
}

module.exports = { CodeParser, LANGUAGE_GRAMMARS, EXTENSION_MAP };
```

**Verify:**
```bash
node -e "const { CodeParser } = require('./.claude/lib/code-indexing/code-parser.cjs'); const p = new CodeParser(); console.log('OK')"
```

**Success Criteria:**
- [ ] CodeParser class instantiates without errors
- [ ] Constants LANGUAGE_GRAMMARS and EXTENSION_MAP exported
- [ ] Constructor accepts options object

---

### 37.2: Implement language detection (1 hour)

**Description:** Add method to detect programming language from file extension.

**Add to CodeParser class:**
```javascript
/**
 * Detect language from file extension
 * @param {string} filePath - Path to source file
 * @returns {string|null} Language identifier or null if unsupported
 */
detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] || null;
}

/**
 * Check if a language is supported
 * @param {string} language - Language identifier
 * @returns {boolean}
 */
isSupported(language) {
  return language in LANGUAGE_GRAMMARS;
}

/**
 * Get list of supported languages
 * @returns {string[]}
 */
getSupportedLanguages() {
  return Object.keys(LANGUAGE_GRAMMARS);
}

/**
 * Get supported file extensions
 * @returns {string[]}
 */
getSupportedExtensions() {
  return Object.keys(EXTENSION_MAP);
}
```

**Verify:**
```bash
node -e "
const { CodeParser } = require('./.claude/lib/code-indexing/code-parser.cjs');
const p = new CodeParser();
console.log('JS:', p.detectLanguage('test.js'));
console.log('TS:', p.detectLanguage('test.ts'));
console.log('PY:', p.detectLanguage('test.py'));
console.log('Unknown:', p.detectLanguage('test.xyz'));
"
```

**Success Criteria:**
- [ ] detectLanguage('test.js') returns 'javascript'
- [ ] detectLanguage('test.py') returns 'python'
- [ ] detectLanguage('unknown.xyz') returns null
- [ ] isSupported('javascript') returns true

---

### 37.3: Implement lazy grammar loading (1.5 hours)

**Description:** Add method to lazily load and cache tree-sitter grammars.

**Add to CodeParser class:**
```javascript
/**
 * Get or load a grammar for the specified language
 * @param {string} language - Language identifier
 * @returns {Promise<Parser.Language>} Loaded grammar
 * @throws {Error} If language not supported
 */
async getGrammar(language) {
  if (!this.isSupported(language)) {
    throw new Error(`Unsupported language: ${language}`);
  }

  // Return cached grammar if available
  if (this.grammars.has(language)) {
    return this.grammars.get(language);
  }

  // Load grammar
  const grammarPath = LANGUAGE_GRAMMARS[language];
  let grammar;

  try {
    // Handle TypeScript TSX special case
    if (grammarPath.includes('/')) {
      const [pkg, variant] = grammarPath.split('/');
      const mod = require(pkg);
      grammar = mod[variant] || mod;
    } else {
      grammar = require(grammarPath);
    }

    this.grammars.set(language, grammar);
    return grammar;
  } catch (error) {
    throw new Error(`Failed to load grammar for ${language}: ${error.message}`);
  }
}

/**
 * Get or create a parser for the specified language
 * @param {string} language - Language identifier
 * @returns {Promise<Parser>} Configured parser
 */
async getParser(language) {
  if (this.parsers.has(language)) {
    return this.parsers.get(language);
  }

  const grammar = await this.getGrammar(language);
  const parser = new Parser();
  parser.setLanguage(grammar);

  this.parsers.set(language, parser);
  return parser;
}
```

**Verify:**
```bash
node -e "
(async () => {
  const { CodeParser } = require('./.claude/lib/code-indexing/code-parser.cjs');
  const p = new CodeParser();
  const grammar = await p.getGrammar('javascript');
  console.log('Grammar loaded:', grammar ? 'YES' : 'NO');
  const parser = await p.getParser('javascript');
  console.log('Parser created:', parser ? 'YES' : 'NO');
})().catch(e => { console.error(e); process.exit(1); });
"
```

**Success Criteria:**
- [ ] Grammar loads successfully for JavaScript
- [ ] Parser can be created with grammar
- [ ] Second call returns cached grammar (fast)

---

### 37.4: Implement parse method (2 hours)

**Description:** Add main parse method to parse source files and return AST.

**Add to CodeParser class:**
```javascript
/**
 * Parse a source file and return AST
 * @param {string} filePath - Path to source file
 * @param {string} [language] - Language override (auto-detected if omitted)
 * @returns {Promise<ParseResult>} Parsed AST with metadata
 */
async parse(filePath, language = null) {
  // Auto-detect language if not provided
  const detectedLanguage = language || this.detectLanguage(filePath);
  if (!detectedLanguage) {
    throw new Error(`Cannot detect language for: ${filePath}`);
  }

  // Read file content
  const content = await fs.readFile(filePath, 'utf-8');

  // Get parser for language
  const parser = await this.getParser(detectedLanguage);

  // Parse content
  const tree = parser.parse(content);

  return {
    filePath,
    language: detectedLanguage,
    content,
    tree,
    rootNode: tree.rootNode,
    lineCount: content.split('\n').length,
    byteLength: Buffer.byteLength(content, 'utf-8'),
    hasErrors: tree.rootNode.hasError()
  };
}

/**
 * Parse source code string directly
 * @param {string} content - Source code string
 * @param {string} language - Language identifier
 * @returns {Promise<ParseResult>} Parsed AST
 */
async parseString(content, language) {
  if (!this.isSupported(language)) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const parser = await this.getParser(language);
  const tree = parser.parse(content);

  return {
    filePath: null,
    language,
    content,
    tree,
    rootNode: tree.rootNode,
    lineCount: content.split('\n').length,
    byteLength: Buffer.byteLength(content, 'utf-8'),
    hasErrors: tree.rootNode.hasError()
  };
}
```

**Verify:**
```bash
node -e "
(async () => {
  const { CodeParser } = require('./.claude/lib/code-indexing/code-parser.cjs');
  const p = new CodeParser();

  // Test parsing a string
  const result = await p.parseString('function hello() { return 42; }', 'javascript');
  console.log('Language:', result.language);
  console.log('Lines:', result.lineCount);
  console.log('Root type:', result.rootNode.type);
  console.log('Has errors:', result.hasErrors);
})().catch(e => { console.error(e); process.exit(1); });
"
```

**Success Criteria:**
- [ ] parseString parses JavaScript successfully
- [ ] Returns rootNode with correct type ('program')
- [ ] hasErrors is false for valid code
- [ ] lineCount is accurate

---

### 37.5: Implement AST traversal helpers (1.5 hours)

**Description:** Add helper methods for traversing the AST to find specific nodes.

**Add to CodeParser class:**
```javascript
/**
 * Traverse AST and collect nodes of specified types
 * @param {SyntaxNode} node - Starting node
 * @param {string[]} types - Node types to collect
 * @param {SyntaxNode[]} [collected] - Accumulated nodes
 * @returns {SyntaxNode[]} Collected nodes
 */
collectNodes(node, types, collected = []) {
  if (types.includes(node.type)) {
    collected.push(node);
  }
  for (const child of node.children) {
    this.collectNodes(child, types, collected);
  }
  return collected;
}

/**
 * Find the first node of specified type
 * @param {SyntaxNode} node - Starting node
 * @param {string} type - Node type to find
 * @returns {SyntaxNode|null} Found node or null
 */
findNode(node, type) {
  if (node.type === type) {
    return node;
  }
  for (const child of node.children) {
    const found = this.findNode(child, type);
    if (found) return found;
  }
  return null;
}

/**
 * Get all top-level declarations from AST
 * @param {ParseResult} parseResult - Parse result from parse()
 * @returns {SyntaxNode[]} Top-level declaration nodes
 */
getTopLevelDeclarations(parseResult) {
  const declarationTypes = [
    // JavaScript/TypeScript
    'function_declaration',
    'class_declaration',
    'method_definition',
    'export_statement',
    'import_statement',
    'variable_declaration',
    'lexical_declaration',
    // Python
    'function_definition',
    'class_definition',
    'import_statement',
    'import_from_statement',
    // Go
    'function_declaration',
    'method_declaration',
    'type_declaration',
    // Rust
    'function_item',
    'impl_item',
    'struct_item',
    'enum_item'
  ];

  return parseResult.rootNode.children.filter(
    child => declarationTypes.includes(child.type)
  );
}
```

**Verify:**
```bash
node -e "
(async () => {
  const { CodeParser } = require('./.claude/lib/code-indexing/code-parser.cjs');
  const p = new CodeParser();

  const code = \`
    function hello() { return 42; }
    class MyClass {
      method() {}
    }
    const x = 1;
  \`;

  const result = await p.parseString(code, 'javascript');
  const decls = p.getTopLevelDeclarations(result);
  console.log('Top-level declarations:', decls.length);
  decls.forEach(d => console.log('  -', d.type));
})().catch(e => { console.error(e); process.exit(1); });
"
```

**Success Criteria:**
- [ ] collectNodes finds all nodes of specified types
- [ ] findNode returns first matching node
- [ ] getTopLevelDeclarations returns function, class, const declarations

---

### 37.6: Implement error handling (1 hour)

**Description:** Add robust error handling for parse failures, malformed files, and edge cases.

**Add to CodeParser class:**
```javascript
/**
 * Get syntax errors from parse result
 * @param {ParseResult} parseResult - Parse result
 * @returns {SyntaxError[]} Array of syntax errors
 */
getSyntaxErrors(parseResult) {
  const errors = [];

  function collectErrors(node) {
    if (node.type === 'ERROR' || node.isMissing()) {
      errors.push({
        type: node.type,
        text: node.text,
        startPosition: node.startPosition,
        endPosition: node.endPosition,
        isMissing: node.isMissing()
      });
    }
    for (const child of node.children) {
      collectErrors(child);
    }
  }

  collectErrors(parseResult.rootNode);
  return errors;
}

/**
 * Safe parse that returns null instead of throwing on failure
 * @param {string} filePath - Path to source file
 * @param {string} [language] - Language override
 * @returns {Promise<ParseResult|null>} Parse result or null on failure
 */
async safeParse(filePath, language = null) {
  try {
    return await this.parse(filePath, language);
  } catch (error) {
    if (this.options.logErrors) {
      console.error(`Parse error for ${filePath}: ${error.message}`);
    }
    return null;
  }
}

/**
 * Validate that a file can be parsed
 * @param {string} filePath - Path to source file
 * @returns {Promise<ValidationResult>} Validation result
 */
async validateFile(filePath) {
  const result = {
    filePath,
    valid: false,
    language: null,
    errors: [],
    warnings: []
  };

  // Check language support
  const language = this.detectLanguage(filePath);
  if (!language) {
    result.errors.push(`Unsupported file type: ${path.extname(filePath)}`);
    return result;
  }
  result.language = language;

  // Try to parse
  try {
    const parseResult = await this.parse(filePath, language);
    const syntaxErrors = this.getSyntaxErrors(parseResult);

    if (syntaxErrors.length > 0) {
      result.warnings.push(`File has ${syntaxErrors.length} syntax error(s)`);
    }

    result.valid = true;
  } catch (error) {
    result.errors.push(error.message);
  }

  return result;
}
```

**Verify:**
```bash
node -e "
(async () => {
  const { CodeParser } = require('./.claude/lib/code-indexing/code-parser.cjs');
  const p = new CodeParser({ logErrors: true });

  // Test with malformed code
  const badCode = 'function { broken syntax';
  const result = await p.parseString(badCode, 'javascript');
  const errors = p.getSyntaxErrors(result);
  console.log('Syntax errors found:', errors.length);

  // Test safeParse
  const safeResult = await p.safeParse('nonexistent.js');
  console.log('safeParse on missing file:', safeResult === null ? 'null (correct)' : 'ERROR');
})().catch(e => { console.error(e); process.exit(1); });
"
```

**Success Criteria:**
- [ ] getSyntaxErrors returns errors for malformed code
- [ ] safeParse returns null instead of throwing
- [ ] validateFile provides detailed validation info

---

### 37.7: Implement multi-language test file parsing (1 hour)

**Description:** Test parsing actual files in different languages.

**Create test file:** `tests/code-indexing/code-parser.test.cjs`

**Test cases:**
```javascript
/**
 * Code Parser Tests
 */

'use strict';

const { CodeParser } = require('../../.claude/lib/code-indexing/code-parser.cjs');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('CodeParser', () => {
  let parser;
  let tempDir;

  beforeAll(async () => {
    parser = new CodeParser();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-parser-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  describe('Language Detection', () => {
    test('detects JavaScript', () => {
      expect(parser.detectLanguage('test.js')).toBe('javascript');
      expect(parser.detectLanguage('test.mjs')).toBe('javascript');
      expect(parser.detectLanguage('test.cjs')).toBe('javascript');
    });

    test('detects TypeScript', () => {
      expect(parser.detectLanguage('test.ts')).toBe('typescript');
      expect(parser.detectLanguage('test.tsx')).toBe('tsx');
    });

    test('detects Python', () => {
      expect(parser.detectLanguage('test.py')).toBe('python');
    });

    test('returns null for unknown', () => {
      expect(parser.detectLanguage('test.xyz')).toBeNull();
    });
  });

  describe('Parsing', () => {
    test('parses JavaScript string', async () => {
      const code = 'function hello() { return 42; }';
      const result = await parser.parseString(code, 'javascript');

      expect(result.language).toBe('javascript');
      expect(result.rootNode.type).toBe('program');
      expect(result.hasErrors).toBe(false);
    });

    test('parses TypeScript string', async () => {
      const code = 'function hello(): number { return 42; }';
      const result = await parser.parseString(code, 'typescript');

      expect(result.language).toBe('typescript');
      expect(result.hasErrors).toBe(false);
    });

    test('parses Python string', async () => {
      const code = 'def hello():\n    return 42';
      const result = await parser.parseString(code, 'python');

      expect(result.language).toBe('python');
      expect(result.hasErrors).toBe(false);
    });

    test('parses file from disk', async () => {
      const filePath = path.join(tempDir, 'test.js');
      await fs.writeFile(filePath, 'const x = 1;');

      const result = await parser.parse(filePath);
      expect(result.language).toBe('javascript');
    });
  });

  describe('Error Handling', () => {
    test('handles malformed code', async () => {
      const code = 'function { broken';
      const result = await parser.parseString(code, 'javascript');

      expect(result.hasErrors).toBe(true);
      const errors = parser.getSyntaxErrors(result);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('safeParse returns null on error', async () => {
      const result = await parser.safeParse('/nonexistent/file.js');
      expect(result).toBeNull();
    });
  });

  describe('AST Traversal', () => {
    test('getTopLevelDeclarations finds functions', async () => {
      const code = `
        function foo() {}
        function bar() {}
        const x = 1;
      `;
      const result = await parser.parseString(code, 'javascript');
      const decls = parser.getTopLevelDeclarations(result);

      expect(decls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
```

**Command:**
```bash
npx jest tests/code-indexing/code-parser.test.cjs --verbose
```

**Success Criteria:**
- [ ] All tests pass
- [ ] JavaScript, TypeScript, Python parsing works
- [ ] Error handling tests pass

---

### 37.8: Write JSDoc documentation (45 min)

**Description:** Add comprehensive JSDoc documentation to all methods.

**Verify:**
```bash
# Check for JSDoc comments on all exported functions
grep -E "^\s*\*\s*@(param|returns|throws)" .claude/lib/code-indexing/code-parser.cjs | wc -l
# Should be >= 15 (multiple params/returns per function)
```

**Success Criteria:**
- [ ] All public methods have JSDoc comments
- [ ] @param, @returns, @throws documented
- [ ] Example usage in class-level JSDoc

---

### 37.9: Update index.cjs exports (15 min)

**Description:** Export CodeParser from the main index file.

**Update:** `.claude/lib/code-indexing/index.cjs`

```javascript
/**
 * Code Indexing System - Main Entry Point
 *
 * @module code-indexing
 */

'use strict';

const { CodeParser, LANGUAGE_GRAMMARS, EXTENSION_MAP } = require('./code-parser.cjs');

module.exports = {
  CodeParser,
  LANGUAGE_GRAMMARS,
  EXTENSION_MAP
};
```

**Verify:**
```bash
node -e "const { CodeParser } = require('./.claude/lib/code-indexing'); console.log('Export OK')"
```

**Success Criteria:**
- [ ] CodeParser exported from index.cjs
- [ ] Import works with short path

---

### Task #37 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 37.1 Class skeleton | 1.5h | #36 complete |
| 37.2 Language detection | 1h | 37.1 |
| 37.3 Lazy grammar loading | 1.5h | 37.1 |
| 37.4 Parse method | 2h | 37.2, 37.3 |
| 37.5 AST traversal | 1.5h | 37.4 |
| 37.6 Error handling | 1h | 37.4 |
| 37.7 Multi-language tests | 1h | 37.1-37.6 |
| 37.8 JSDoc documentation | 45m | 37.1-37.6 |
| 37.9 Update exports | 15m | 37.1-37.8 |
| **Total** | **10.5h** | |

**Verification Gate:**
```bash
npx jest tests/code-indexing/code-parser.test.cjs && \
node -e "
(async () => {
  const { CodeParser } = require('./.claude/lib/code-indexing');
  const p = new CodeParser();

  // Parse all supported languages
  const tests = [
    ['function f() {}', 'javascript'],
    ['def f(): pass', 'python'],
    ['func f() {}', 'go'],
    ['fn f() {}', 'rust']
  ];

  for (const [code, lang] of tests) {
    const r = await p.parseString(code, lang);
    if (r.hasErrors) throw new Error('Parse failed: ' + lang);
  }
  console.log('GATE PASSED: Task #37 complete');
})().catch(e => { console.error(e); process.exit(1); });
"
```

---

## Task #38: Implement semantic-chunker.cjs

**Estimated Total Effort:** 14-16 hours
**Dependencies:** Task #37 (CodeParser)
**Blocks:** Task #39 (Embedder), Task #41 (Orchestrator)

### 38.1: Implement SemanticChunker class skeleton (1 hour)

**File:** `.claude/lib/code-indexing/semantic-chunker.cjs`

**Implementation:**
```javascript
/**
 * Semantic Chunker - Extract meaningful code units from AST
 *
 * @module code-indexing/semantic-chunker
 */

'use strict';

const crypto = require('crypto');

// Chunk types
const CHUNK_TYPES = {
  FUNCTION: 'function',
  CLASS: 'class',
  METHOD: 'method',
  INTERFACE: 'interface',
  TYPE: 'type',
  MODULE: 'module',
  IMPORT: 'import',
  EXPORT: 'export',
  COMMENT: 'comment',
  OTHER: 'other'
};

// Default chunking options
const DEFAULT_OPTIONS = {
  minTokens: 50,
  maxTokens: 2048,
  targetTokens: 512,
  overlapTokens: 50
};

class SemanticChunker {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // Methods to implement in subsequent subtasks
}

module.exports = { SemanticChunker, CHUNK_TYPES, DEFAULT_OPTIONS };
```

**Verify:**
```bash
node -e "const { SemanticChunker } = require('./.claude/lib/code-indexing/semantic-chunker.cjs'); const c = new SemanticChunker(); console.log('OK')"
```

---

### 38.2: Implement token counting (1.5 hours)

**Description:** Add approximate token counting for code chunks.

**Add to SemanticChunker:**
```javascript
/**
 * Estimate token count for text (GPT-4 approximation)
 * Rule: ~4 characters per token for code
 * @param {string} text - Text to count
 * @returns {number} Estimated token count
 */
estimateTokens(text) {
  if (!text) return 0;
  // More accurate estimation for code:
  // - Whitespace counts less
  // - Symbols count more (brackets, semicolons)
  const normalized = text.replace(/\s+/g, ' ');
  return Math.ceil(normalized.length / 4);
}

/**
 * Check if chunk size is within limits
 * @param {string} content - Chunk content
 * @returns {Object} Size validation result
 */
validateChunkSize(content) {
  const tokens = this.estimateTokens(content);
  return {
    tokens,
    tooSmall: tokens < this.options.minTokens,
    tooLarge: tokens > this.options.maxTokens,
    valid: tokens >= this.options.minTokens && tokens <= this.options.maxTokens
  };
}
```

**Verify:**
```bash
node -e "
const { SemanticChunker } = require('./.claude/lib/code-indexing/semantic-chunker.cjs');
const c = new SemanticChunker();
console.log('Token estimate for 100 chars:', c.estimateTokens('x'.repeat(100)));
console.log('Valid chunk:', c.validateChunkSize('function foo() { return 42; }'));
"
```

---

### 38.3: Implement chunk ID generation (30 min)

**Add to SemanticChunker:**
```javascript
/**
 * Generate unique chunk ID based on content and location
 * @param {string} filePath - Source file path
 * @param {number} lineStart - Starting line
 * @param {string} content - Chunk content
 * @returns {string} Unique chunk ID
 */
generateChunkId(filePath, lineStart, content) {
  const hash = crypto.createHash('sha256')
    .update(`${filePath}:${lineStart}:${content.substring(0, 100)}`)
    .digest('hex')
    .substring(0, 16);
  return `chunk_${hash}`;
}
```

---

### 38.4: Implement node type mapping (1.5 hours)

**Description:** Map AST node types to chunk types for each language.

**Add to SemanticChunker:**
```javascript
// Node type to chunk type mapping by language
static NODE_TYPE_MAP = {
  javascript: {
    function_declaration: CHUNK_TYPES.FUNCTION,
    arrow_function: CHUNK_TYPES.FUNCTION,
    class_declaration: CHUNK_TYPES.CLASS,
    method_definition: CHUNK_TYPES.METHOD,
    export_statement: CHUNK_TYPES.EXPORT,
    import_statement: CHUNK_TYPES.IMPORT,
    lexical_declaration: CHUNK_TYPES.OTHER,
    variable_declaration: CHUNK_TYPES.OTHER
  },
  typescript: {
    function_declaration: CHUNK_TYPES.FUNCTION,
    arrow_function: CHUNK_TYPES.FUNCTION,
    class_declaration: CHUNK_TYPES.CLASS,
    method_definition: CHUNK_TYPES.METHOD,
    interface_declaration: CHUNK_TYPES.INTERFACE,
    type_alias_declaration: CHUNK_TYPES.TYPE,
    export_statement: CHUNK_TYPES.EXPORT,
    import_statement: CHUNK_TYPES.IMPORT
  },
  python: {
    function_definition: CHUNK_TYPES.FUNCTION,
    class_definition: CHUNK_TYPES.CLASS,
    import_statement: CHUNK_TYPES.IMPORT,
    import_from_statement: CHUNK_TYPES.IMPORT
  },
  go: {
    function_declaration: CHUNK_TYPES.FUNCTION,
    method_declaration: CHUNK_TYPES.METHOD,
    type_declaration: CHUNK_TYPES.TYPE
  },
  rust: {
    function_item: CHUNK_TYPES.FUNCTION,
    impl_item: CHUNK_TYPES.CLASS,
    struct_item: CHUNK_TYPES.TYPE,
    enum_item: CHUNK_TYPES.TYPE,
    trait_item: CHUNK_TYPES.INTERFACE
  }
};

/**
 * Get chunk type for AST node
 * @param {string} nodeType - AST node type
 * @param {string} language - Source language
 * @returns {string} Chunk type
 */
getChunkType(nodeType, language) {
  const langMap = SemanticChunker.NODE_TYPE_MAP[language] || {};
  return langMap[nodeType] || CHUNK_TYPES.OTHER;
}
```

---

### 38.5: Implement name extraction (1 hour)

**Description:** Extract function/class names from AST nodes.

**Add to SemanticChunker:**
```javascript
/**
 * Extract name from AST node
 * @param {SyntaxNode} node - AST node
 * @param {string} language - Source language
 * @returns {string|null} Extracted name or null
 */
extractName(node, language) {
  // Try common name child types
  const nameTypes = ['identifier', 'name', 'property_identifier'];

  for (const child of node.children) {
    if (nameTypes.includes(child.type)) {
      return child.text;
    }
  }

  // Language-specific extraction
  if (language === 'python') {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return nameNode.text;
  }

  return null;
}

/**
 * Extract function signature
 * @param {SyntaxNode} node - Function node
 * @param {string} content - Full file content
 * @returns {string} Function signature (first line)
 */
extractSignature(node, content) {
  const startLine = node.startPosition.row;
  const lines = content.split('\n');

  // Get first line of function
  let signature = lines[startLine];

  // For multi-line signatures, include up to opening brace
  let lineIndex = startLine;
  while (lineIndex < lines.length && !signature.includes('{') && !signature.includes(':')) {
    lineIndex++;
    if (lineIndex < lines.length) {
      signature += ' ' + lines[lineIndex].trim();
    }
  }

  // Clean up
  return signature.trim().replace(/\s+/g, ' ').substring(0, 200);
}
```

---

### 38.6: Implement main chunk() method (2.5 hours)

**Description:** Main method to chunk an AST into semantic units.

**Add to SemanticChunker:**
```javascript
/**
 * Chunk a parsed AST into semantic units
 * @param {ParseResult} parseResult - Parse result from CodeParser
 * @param {string} filePath - Source file path
 * @returns {CodeChunk[]} Array of code chunks
 */
chunk(parseResult, filePath) {
  const chunks = [];
  const { content, language, rootNode } = parseResult;

  // Process top-level nodes
  for (const node of rootNode.children) {
    const chunkType = this.getChunkType(node.type, language);

    // Skip trivial nodes
    if (chunkType === CHUNK_TYPES.OTHER && this.estimateTokens(node.text) < this.options.minTokens) {
      continue;
    }

    // Handle classes specially (extract methods)
    if (chunkType === CHUNK_TYPES.CLASS) {
      chunks.push(...this.chunkClass(node, language, filePath, content));
    } else {
      const chunk = this.createChunk(node, chunkType, language, filePath, content);
      if (chunk) {
        // Split if too large
        if (chunk.tokenCount > this.options.maxTokens) {
          chunks.push(...this.splitLargeChunk(chunk));
        } else if (chunk.tokenCount >= this.options.minTokens) {
          chunks.push(chunk);
        }
      }
    }
  }

  return chunks;
}

/**
 * Create a single chunk from AST node
 * @param {SyntaxNode} node - AST node
 * @param {string} chunkType - Chunk type
 * @param {string} language - Source language
 * @param {string} filePath - Source file path
 * @param {string} content - Full file content
 * @param {string} [parentId] - Parent chunk ID
 * @returns {CodeChunk} Created chunk
 */
createChunk(node, chunkType, language, filePath, content, parentId = null) {
  const chunkContent = node.text;
  const tokenCount = this.estimateTokens(chunkContent);
  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;

  return {
    id: this.generateChunkId(filePath, lineStart, chunkContent),
    content: chunkContent,
    type: chunkType,
    language,
    filePath,
    lineStart,
    lineEnd,
    tokenCount,
    name: this.extractName(node, language),
    signature: this.extractSignature(node, content),
    parentChunk: parentId
  };
}
```

---

### 38.7: Implement class chunking (1.5 hours)

**Description:** Special handling for classes - extract header + methods.

**Add to SemanticChunker:**
```javascript
/**
 * Chunk a class into header + methods
 * @param {SyntaxNode} classNode - Class AST node
 * @param {string} language - Source language
 * @param {string} filePath - Source file path
 * @param {string} content - Full file content
 * @returns {CodeChunk[]} Array of chunks (header + methods)
 */
chunkClass(classNode, language, filePath, content) {
  const chunks = [];

  // Create class header chunk
  const className = this.extractName(classNode, language);
  const classId = this.generateChunkId(filePath, classNode.startPosition.row + 1, className || 'class');

  // Extract class header (everything before first method)
  const headerChunk = this.extractClassHeader(classNode, language, filePath, content, classId);
  if (headerChunk) {
    chunks.push(headerChunk);
  }

  // Extract methods
  const methodTypes = ['method_definition', 'function_definition', 'method_declaration'];
  for (const child of classNode.children) {
    if (methodTypes.includes(child.type)) {
      const methodChunk = this.createChunk(
        child,
        CHUNK_TYPES.METHOD,
        language,
        filePath,
        content,
        classId
      );
      if (methodChunk && methodChunk.tokenCount >= this.options.minTokens) {
        // Split large methods
        if (methodChunk.tokenCount > this.options.maxTokens) {
          chunks.push(...this.splitLargeChunk(methodChunk));
        } else {
          chunks.push(methodChunk);
        }
      }
    }
    // Recursively handle nested classes
    else if (child.type === 'class_declaration' || child.type === 'class_definition') {
      chunks.push(...this.chunkClass(child, language, filePath, content));
    }
  }

  return chunks;
}

/**
 * Extract class header (signature, docstring, properties)
 */
extractClassHeader(classNode, language, filePath, content, classId) {
  // Find first method
  let firstMethodStart = classNode.endPosition.row;
  const methodTypes = ['method_definition', 'function_definition'];

  for (const child of classNode.children) {
    if (methodTypes.includes(child.type)) {
      firstMethodStart = Math.min(firstMethodStart, child.startPosition.row);
      break;
    }
  }

  const lines = content.split('\n');
  const headerLines = lines.slice(classNode.startPosition.row, firstMethodStart);
  const headerContent = headerLines.join('\n');

  if (this.estimateTokens(headerContent) < this.options.minTokens) {
    return null;
  }

  return {
    id: classId,
    content: headerContent,
    type: CHUNK_TYPES.CLASS,
    language,
    filePath,
    lineStart: classNode.startPosition.row + 1,
    lineEnd: firstMethodStart + 1,
    tokenCount: this.estimateTokens(headerContent),
    name: this.extractName(classNode, language),
    signature: this.extractSignature(classNode, content),
    parentChunk: null
  };
}
```

---

### 38.8: Implement large chunk splitting (1.5 hours)

**Description:** Split chunks that exceed maxTokens into smaller overlapping chunks.

**Add to SemanticChunker:**
```javascript
/**
 * Split a large chunk into smaller overlapping chunks
 * @param {CodeChunk} chunk - Large chunk to split
 * @returns {CodeChunk[]} Array of smaller chunks
 */
splitLargeChunk(chunk) {
  const chunks = [];
  const lines = chunk.content.split('\n');
  const targetLines = Math.ceil(this.options.targetTokens / 4); // ~4 chars per token, ~10 chars per line
  const overlapLines = Math.ceil(this.options.overlapTokens / 4);

  let startLine = 0;
  let partIndex = 0;

  while (startLine < lines.length) {
    const endLine = Math.min(startLine + targetLines, lines.length);
    const chunkLines = lines.slice(startLine, endLine);
    const chunkContent = chunkLines.join('\n');

    const tokenCount = this.estimateTokens(chunkContent);

    // Skip if too small (except for last chunk)
    if (tokenCount >= this.options.minTokens || endLine >= lines.length) {
      chunks.push({
        id: `${chunk.id}_part${partIndex}`,
        content: chunkContent,
        type: chunk.type,
        language: chunk.language,
        filePath: chunk.filePath,
        lineStart: chunk.lineStart + startLine,
        lineEnd: chunk.lineStart + endLine - 1,
        tokenCount,
        name: chunk.name ? `${chunk.name} (part ${partIndex + 1})` : null,
        signature: partIndex === 0 ? chunk.signature : null,
        parentChunk: chunk.parentChunk
      });
      partIndex++;
    }

    // Move start with overlap
    startLine = endLine - overlapLines;
    if (startLine >= endLine) break; // Avoid infinite loop
  }

  return chunks;
}
```

---

### 38.9: Write unit tests (1.5 hours)

**Create:** `tests/code-indexing/semantic-chunker.test.cjs`

```javascript
'use strict';

const { SemanticChunker, CHUNK_TYPES } = require('../../.claude/lib/code-indexing/semantic-chunker.cjs');
const { CodeParser } = require('../../.claude/lib/code-indexing/code-parser.cjs');

describe('SemanticChunker', () => {
  let chunker;
  let parser;

  beforeAll(() => {
    chunker = new SemanticChunker();
    parser = new CodeParser();
  });

  describe('Token Counting', () => {
    test('estimates tokens for short text', () => {
      const tokens = chunker.estimateTokens('hello world');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    test('validates chunk size', () => {
      const small = chunker.validateChunkSize('x');
      expect(small.tooSmall).toBe(true);

      const valid = chunker.validateChunkSize('function foo() { return 42; }');
      // This is borderline - may be too small depending on minTokens
    });
  });

  describe('Chunk ID Generation', () => {
    test('generates unique IDs', () => {
      const id1 = chunker.generateChunkId('test.js', 1, 'content1');
      const id2 = chunker.generateChunkId('test.js', 1, 'content2');
      expect(id1).not.toBe(id2);
    });

    test('same input generates same ID', () => {
      const id1 = chunker.generateChunkId('test.js', 1, 'content');
      const id2 = chunker.generateChunkId('test.js', 1, 'content');
      expect(id1).toBe(id2);
    });
  });

  describe('Chunking', () => {
    test('chunks JavaScript functions', async () => {
      const code = `
        function foo() {
          console.log('hello');
          return 42;
        }

        function bar() {
          return 'world';
        }
      `;

      const parseResult = await parser.parseString(code, 'javascript');
      const chunks = chunker.chunk(parseResult, 'test.js');

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks.some(c => c.type === CHUNK_TYPES.FUNCTION)).toBe(true);
    });

    test('chunks JavaScript class with methods', async () => {
      const code = `
        class MyClass {
          constructor() {
            this.value = 0;
          }

          getValue() {
            return this.value;
          }

          setValue(v) {
            this.value = v;
          }
        }
      `;

      const parseResult = await parser.parseString(code, 'javascript');
      const chunks = chunker.chunk(parseResult, 'test.js');

      // Should have class header + methods
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    test('chunks Python code', async () => {
      const code = `
def hello():
    """Say hello"""
    print("Hello, world!")
    return True

class MyClass:
    def __init__(self):
        self.value = 0

    def get_value(self):
        return self.value
      `;

      const parseResult = await parser.parseString(code, 'python');
      const chunks = chunker.chunk(parseResult, 'test.py');

      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Large Chunk Splitting', () => {
    test('splits large chunks', () => {
      // Create a chunk larger than maxTokens
      const largeContent = Array(500).fill('const x = 1;').join('\n');
      const largeChunk = {
        id: 'large_chunk',
        content: largeContent,
        type: CHUNK_TYPES.FUNCTION,
        language: 'javascript',
        filePath: 'test.js',
        lineStart: 1,
        lineEnd: 500,
        tokenCount: chunker.estimateTokens(largeContent),
        name: 'largeFn',
        signature: 'function largeFn()',
        parentChunk: null
      };

      const splitChunks = chunker.splitLargeChunk(largeChunk);

      expect(splitChunks.length).toBeGreaterThan(1);
      splitChunks.forEach(c => {
        expect(c.tokenCount).toBeLessThanOrEqual(chunker.options.maxTokens * 1.5); // Some flexibility
      });
    });
  });
});
```

**Command:**
```bash
npx jest tests/code-indexing/semantic-chunker.test.cjs --verbose
```

---

### 38.10: Update index.cjs exports (15 min)

**Update:** `.claude/lib/code-indexing/index.cjs`

```javascript
const { SemanticChunker, CHUNK_TYPES, DEFAULT_OPTIONS } = require('./semantic-chunker.cjs');

module.exports = {
  // ... existing exports
  SemanticChunker,
  CHUNK_TYPES,
  DEFAULT_OPTIONS
};
```

---

### Task #38 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 38.1 Class skeleton | 1h | #37 complete |
| 38.2 Token counting | 1.5h | 38.1 |
| 38.3 Chunk ID generation | 30m | 38.1 |
| 38.4 Node type mapping | 1.5h | 38.1 |
| 38.5 Name extraction | 1h | 38.4 |
| 38.6 Main chunk() method | 2.5h | 38.2-38.5 |
| 38.7 Class chunking | 1.5h | 38.6 |
| 38.8 Large chunk splitting | 1.5h | 38.6 |
| 38.9 Unit tests | 1.5h | 38.1-38.8 |
| 38.10 Update exports | 15m | 38.1-38.9 |
| **Total** | **12.75h** | |

**Verification Gate:**
```bash
npx jest tests/code-indexing/semantic-chunker.test.cjs && \
node -e "
(async () => {
  const { CodeParser, SemanticChunker } = require('./.claude/lib/code-indexing');
  const parser = new CodeParser();
  const chunker = new SemanticChunker();

  const code = 'function test() { return 42; }';
  const result = await parser.parseString(code, 'javascript');
  const chunks = chunker.chunk(result, 'test.js');

  console.log('Chunks created:', chunks.length);
  if (chunks.length < 1) throw new Error('No chunks created');
  console.log('GATE PASSED: Task #38 complete');
})().catch(e => { console.error(e); process.exit(1); });
"
```

---

## Task #39: Implement embedding-generator.cjs (local embeddings)

**Estimated Total Effort:** 10-12 hours
**Dependencies:** Task #36 complete (packages installed)
**Blocks:** Task #41 (Orchestrator)

### 39.1: Implement EmbeddingGenerator class skeleton (1 hour)

**File:** `.claude/lib/code-indexing/embedding-generator.cjs`

```javascript
/**
 * Embedding Generator - Local embeddings via transformers.js
 *
 * @module code-indexing/embedding-generator
 */

'use strict';

const DEFAULT_OPTIONS = {
  model: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  batchSize: 100,
  cacheEnabled: true,
  cachePath: '.claude/context/data/code-index/embedding-cache.json'
};

class EmbeddingGenerator {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.pipeline = null;
    this.cache = new Map();
    this.initialized = false;
  }

  // Methods to implement in subsequent subtasks
}

module.exports = { EmbeddingGenerator, DEFAULT_OPTIONS };
```

---

### 39.2: Implement initialization and model loading (1.5 hours)

**Add to EmbeddingGenerator:**
```javascript
/**
 * Initialize the embedding pipeline
 * Downloads model on first run (~25MB)
 * @returns {Promise<void>}
 */
async initialize() {
  if (this.initialized) return;

  const { pipeline } = await import('@xenova/transformers');

  console.log(`Loading embedding model: ${this.options.model}...`);
  this.pipeline = await pipeline('feature-extraction', this.options.model, {
    quantized: true // Use quantized model for faster inference
  });

  this.initialized = true;
  console.log('Embedding model loaded successfully');

  // Load cache if enabled
  if (this.options.cacheEnabled) {
    await this.loadCache();
  }
}

/**
 * Check if generator is initialized
 * @returns {boolean}
 */
isInitialized() {
  return this.initialized;
}

/**
 * Get embedding dimensions
 * @returns {number}
 */
getDimensions() {
  return this.options.dimensions;
}
```

---

### 39.3: Implement single text embedding (1 hour)

**Add to EmbeddingGenerator:**
```javascript
/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @param {boolean} useCache - Whether to use cache
 * @returns {Promise<number[]>} Embedding vector
 */
async embed(text, useCache = true) {
  if (!this.initialized) {
    await this.initialize();
  }

  // Check cache
  if (useCache && this.options.cacheEnabled) {
    const cached = this.getFromCache(text);
    if (cached) return cached;
  }

  // Generate embedding
  const output = await this.pipeline(text, {
    pooling: 'mean',
    normalize: true
  });

  // Convert to array
  const embedding = Array.from(output.data);

  // Cache result
  if (useCache && this.options.cacheEnabled) {
    this.addToCache(text, embedding);
  }

  return embedding;
}
```

---

### 39.4: Implement batch embedding (1.5 hours)

**Add to EmbeddingGenerator:**
```javascript
/**
 * Batch generate embeddings
 * @param {string[]} texts - Array of texts
 * @param {Function} [onProgress] - Progress callback (index, total)
 * @returns {Promise<number[][]>} Array of embeddings
 */
async batchEmbed(texts, onProgress = null) {
  if (!this.initialized) {
    await this.initialize();
  }

  const embeddings = [];
  const batchSize = this.options.batchSize;
  const total = texts.length;

  for (let i = 0; i < total; i += batchSize) {
    const batch = texts.slice(i, Math.min(i + batchSize, total));
    const batchEmbeddings = await Promise.all(
      batch.map(text => this.embed(text))
    );
    embeddings.push(...batchEmbeddings);

    if (onProgress) {
      onProgress(Math.min(i + batchSize, total), total);
    }
  }

  return embeddings;
}

/**
 * Embed code chunks with metadata
 * @param {CodeChunk[]} chunks - Array of code chunks
 * @param {Function} [onProgress] - Progress callback
 * @returns {Promise<{chunk: CodeChunk, embedding: number[]}[]>}
 */
async embedChunks(chunks, onProgress = null) {
  const texts = chunks.map(chunk => this.prepareForEmbedding(chunk));
  const embeddings = await this.batchEmbed(texts, onProgress);

  return chunks.map((chunk, i) => ({
    chunk,
    embedding: embeddings[i]
  }));
}

/**
 * Prepare chunk content for embedding
 * Adds context prefix for better code embeddings
 * @param {CodeChunk} chunk - Code chunk
 * @returns {string} Prepared text
 */
prepareForEmbedding(chunk) {
  const prefix = `[${chunk.language}] [${chunk.type}]`;
  const signature = chunk.signature ? `Signature: ${chunk.signature}\n` : '';
  const name = chunk.name ? `Name: ${chunk.name}\n` : '';

  return `${prefix}\n${name}${signature}Code:\n${chunk.content}`;
}
```

---

### 39.5: Implement caching (1.5 hours)

**Add to EmbeddingGenerator:**
```javascript
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Generate cache key for text
 * @param {string} text - Text to hash
 * @returns {string} Cache key
 */
getCacheKey(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Get embedding from cache
 * @param {string} text - Original text
 * @returns {number[]|null} Cached embedding or null
 */
getFromCache(text) {
  const key = this.getCacheKey(text);
  return this.cache.get(key) || null;
}

/**
 * Add embedding to cache
 * @param {string} text - Original text
 * @param {number[]} embedding - Embedding vector
 */
addToCache(text, embedding) {
  const key = this.getCacheKey(text);
  this.cache.set(key, embedding);
}

/**
 * Save cache to disk
 * @returns {Promise<void>}
 */
async saveCache() {
  if (!this.options.cacheEnabled) return;

  const cacheDir = path.dirname(this.options.cachePath);
  await fs.mkdir(cacheDir, { recursive: true });

  const cacheData = Object.fromEntries(this.cache);
  await fs.writeFile(
    this.options.cachePath,
    JSON.stringify(cacheData),
    'utf-8'
  );
}

/**
 * Load cache from disk
 * @returns {Promise<void>}
 */
async loadCache() {
  if (!this.options.cacheEnabled) return;

  try {
    const data = await fs.readFile(this.options.cachePath, 'utf-8');
    const cacheData = JSON.parse(data);
    this.cache = new Map(Object.entries(cacheData));
    console.log(`Loaded ${this.cache.size} cached embeddings`);
  } catch (error) {
    // Cache file doesn't exist or is invalid
    this.cache = new Map();
  }
}

/**
 * Clear cache
 */
clearCache() {
  this.cache.clear();
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
getCacheStats() {
  return {
    size: this.cache.size,
    enabled: this.options.cacheEnabled,
    path: this.options.cachePath
  };
}
```

---

### 39.6: Write unit tests (1.5 hours)

**Create:** `tests/code-indexing/embedding-generator.test.cjs`

```javascript
'use strict';

const { EmbeddingGenerator } = require('../../.claude/lib/code-indexing/embedding-generator.cjs');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('EmbeddingGenerator', () => {
  let generator;
  let tempDir;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'embed-test-'));
    generator = new EmbeddingGenerator({
      cachePath: path.join(tempDir, 'cache.json')
    });
  }, 60000); // 60s timeout for model download

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  describe('Initialization', () => {
    test('initializes successfully', async () => {
      await generator.initialize();
      expect(generator.isInitialized()).toBe(true);
    }, 60000);

    test('returns correct dimensions', () => {
      expect(generator.getDimensions()).toBe(384);
    });
  });

  describe('Single Embedding', () => {
    test('generates embedding for text', async () => {
      const embedding = await generator.embed('hello world');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(384);
      expect(embedding.every(v => typeof v === 'number')).toBe(true);
    });

    test('embeddings are normalized', async () => {
      const embedding = await generator.embed('test text');

      // Check L2 norm is ~1
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1, 2);
    });
  });

  describe('Batch Embedding', () => {
    test('generates embeddings for multiple texts', async () => {
      const texts = ['hello', 'world', 'test'];
      const embeddings = await generator.batchEmbed(texts);

      expect(embeddings.length).toBe(3);
      embeddings.forEach(emb => {
        expect(emb.length).toBe(384);
      });
    });

    test('calls progress callback', async () => {
      const texts = Array(10).fill('test');
      const progressCalls = [];

      await generator.batchEmbed(texts, (current, total) => {
        progressCalls.push({ current, total });
      });

      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Caching', () => {
    test('caches embeddings', async () => {
      const text = 'cache test ' + Date.now();

      // First call - generates embedding
      const emb1 = await generator.embed(text);

      // Second call - should use cache
      const emb2 = await generator.embed(text);

      expect(emb1).toEqual(emb2);
    });

    test('saves and loads cache', async () => {
      const text = 'persist test ' + Date.now();
      await generator.embed(text);

      // Save cache
      await generator.saveCache();

      // Create new generator and load cache
      const newGenerator = new EmbeddingGenerator({
        cachePath: path.join(tempDir, 'cache.json')
      });
      await newGenerator.loadCache();

      const cached = newGenerator.getFromCache(text);
      expect(cached).not.toBeNull();
    });
  });
});
```

---

### 39.7: Update index.cjs exports (15 min)

**Update:** `.claude/lib/code-indexing/index.cjs`

```javascript
const { EmbeddingGenerator } = require('./embedding-generator.cjs');

module.exports = {
  // ... existing exports
  EmbeddingGenerator
};
```

---

### Task #39 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 39.1 Class skeleton | 1h | #36 complete |
| 39.2 Model loading | 1.5h | 39.1 |
| 39.3 Single embedding | 1h | 39.2 |
| 39.4 Batch embedding | 1.5h | 39.3 |
| 39.5 Caching | 1.5h | 39.3 |
| 39.6 Unit tests | 1.5h | 39.1-39.5 |
| 39.7 Update exports | 15m | 39.1-39.6 |
| **Total** | **8.25h** | |

**Verification Gate:**
```bash
npx jest tests/code-indexing/embedding-generator.test.cjs --verbose && \
node -e "
(async () => {
  const { EmbeddingGenerator } = require('./.claude/lib/code-indexing');
  const gen = new EmbeddingGenerator();
  await gen.initialize();
  const emb = await gen.embed('test code function');
  console.log('Embedding dimensions:', emb.length);
  if (emb.length !== 384) throw new Error('Wrong dimensions');
  console.log('GATE PASSED: Task #39 complete');
})().catch(e => { console.error(e); process.exit(1); });
"
```

---

## Task #40: Implement vector-store.cjs (ChromaDB wrapper)

**Estimated Total Effort:** 8-10 hours
**Dependencies:** Task #36 complete, Task #39 complete
**Blocks:** Task #41 (Orchestrator)

### 40.1: Implement CodeVectorStore class skeleton (1 hour)

**File:** `.claude/lib/code-indexing/vector-store.cjs`

```javascript
/**
 * Vector Store - ChromaDB wrapper for code embeddings
 *
 * @module code-indexing/vector-store
 */

'use strict';

const { ChromaClient } = require('chromadb');
const path = require('path');

const DEFAULT_OPTIONS = {
  persistDirectory: '.claude/context/data/code-index',
  collectionName: 'agent-studio-code',
  distanceFunction: 'cosine'
};

class CodeVectorStore {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.client = null;
    this.collection = null;
    this.initialized = false;
  }

  // Methods to implement
}

module.exports = { CodeVectorStore, DEFAULT_OPTIONS };
```

---

### 40.2: Implement initialization (1 hour)

**Add to CodeVectorStore:**
```javascript
/**
 * Initialize ChromaDB client and collection
 * @returns {Promise<void>}
 */
async initialize() {
  if (this.initialized) return;

  // Create client with persistent storage
  this.client = new ChromaClient({
    path: this.options.persistDirectory
  });

  // Get or create collection
  this.collection = await this.client.getOrCreateCollection({
    name: this.options.collectionName,
    metadata: {
      'hnsw:space': this.options.distanceFunction,
      description: 'Code indexing collection for Agent-Studio'
    }
  });

  this.initialized = true;
  console.log(`Vector store initialized: ${this.options.collectionName}`);
}

/**
 * Check if store is initialized
 * @returns {boolean}
 */
isInitialized() {
  return this.initialized;
}
```

---

### 40.3: Implement addChunks (1.5 hours)

**Add to CodeVectorStore:**
```javascript
/**
 * Add code chunks to the index
 * @param {Array<{chunk: CodeChunk, embedding: number[]}>} items - Chunks with embeddings
 * @returns {Promise<{added: number}>}
 */
async addChunks(items) {
  if (!this.initialized) {
    await this.initialize();
  }

  if (items.length === 0) {
    return { added: 0 };
  }

  // Prepare data for ChromaDB
  const ids = items.map(item => item.chunk.id);
  const embeddings = items.map(item => item.embedding);
  const documents = items.map(item => item.chunk.content);
  const metadatas = items.map(item => ({
    filePath: item.chunk.filePath,
    language: item.chunk.language,
    type: item.chunk.type,
    lineStart: item.chunk.lineStart,
    lineEnd: item.chunk.lineEnd,
    tokenCount: item.chunk.tokenCount,
    name: item.chunk.name || '',
    signature: item.chunk.signature || '',
    parentChunk: item.chunk.parentChunk || ''
  }));

  // Upsert (add or update)
  await this.collection.upsert({
    ids,
    embeddings,
    documents,
    metadatas
  });

  return { added: items.length };
}

/**
 * Add a single chunk to the index
 * @param {CodeChunk} chunk - Code chunk
 * @param {number[]} embedding - Embedding vector
 * @returns {Promise<void>}
 */
async addChunk(chunk, embedding) {
  await this.addChunks([{ chunk, embedding }]);
}
```

---

### 40.4: Implement search (1.5 hours)

**Add to CodeVectorStore:**
```javascript
/**
 * Search for similar code
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {SearchOptions} options - Search options
 * @returns {Promise<SearchResult[]>}
 */
async search(queryEmbedding, options = {}) {
  if (!this.initialized) {
    await this.initialize();
  }

  const limit = options.limit || 10;
  const minScore = options.minScore || 0.5;

  // Build where clause for filters
  const where = this.buildWhereClause(options.filters);

  // Query ChromaDB
  const results = await this.collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: limit,
    where: where || undefined,
    include: ['documents', 'metadatas', 'distances']
  });

  // Transform results
  const searchResults = [];

  if (results.ids && results.ids[0]) {
    for (let i = 0; i < results.ids[0].length; i++) {
      // ChromaDB returns distance, convert to similarity score
      const distance = results.distances[0][i];
      const score = 1 - distance; // Cosine distance to similarity

      if (score >= minScore) {
        searchResults.push({
          id: results.ids[0][i],
          content: results.documents[0][i],
          metadata: results.metadatas[0][i],
          score
        });
      }
    }
  }

  return searchResults;
}

/**
 * Build ChromaDB where clause from filters
 * @param {Object} filters - Search filters
 * @returns {Object|null} ChromaDB where clause
 */
buildWhereClause(filters) {
  if (!filters) return null;

  const conditions = [];

  if (filters.language) {
    if (Array.isArray(filters.language)) {
      conditions.push({ language: { $in: filters.language } });
    } else {
      conditions.push({ language: filters.language });
    }
  }

  if (filters.type) {
    if (Array.isArray(filters.type)) {
      conditions.push({ type: { $in: filters.type } });
    } else {
      conditions.push({ type: filters.type });
    }
  }

  if (filters.filePath) {
    conditions.push({ filePath: { $contains: filters.filePath } });
  }

  if (conditions.length === 0) return null;
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}
```

---

### 40.5: Implement delete operations (1 hour)

**Add to CodeVectorStore:**
```javascript
/**
 * Delete chunks by file path
 * @param {string} filePath - File path to delete
 * @returns {Promise<{deleted: number}>}
 */
async deleteByPath(filePath) {
  if (!this.initialized) {
    await this.initialize();
  }

  // Get IDs of chunks to delete
  const results = await this.collection.get({
    where: { filePath: filePath },
    include: []
  });

  if (results.ids.length === 0) {
    return { deleted: 0 };
  }

  // Delete by IDs
  await this.collection.delete({
    ids: results.ids
  });

  return { deleted: results.ids.length };
}

/**
 * Delete chunks by IDs
 * @param {string[]} ids - Chunk IDs to delete
 * @returns {Promise<{deleted: number}>}
 */
async deleteByIds(ids) {
  if (!this.initialized) {
    await this.initialize();
  }

  await this.collection.delete({ ids });
  return { deleted: ids.length };
}

/**
 * Delete all chunks (clear collection)
 * @returns {Promise<void>}
 */
async deleteAll() {
  if (!this.initialized) {
    await this.initialize();
  }

  // Delete and recreate collection
  await this.client.deleteCollection(this.options.collectionName);
  this.collection = await this.client.getOrCreateCollection({
    name: this.options.collectionName,
    metadata: {
      'hnsw:space': this.options.distanceFunction
    }
  });
}
```

---

### 40.6: Implement statistics and utilities (45 min)

**Add to CodeVectorStore:**
```javascript
/**
 * Get index statistics
 * @returns {Promise<IndexStats>}
 */
async getStats() {
  if (!this.initialized) {
    await this.initialize();
  }

  const count = await this.collection.count();

  return {
    collectionName: this.options.collectionName,
    totalChunks: count,
    persistDirectory: this.options.persistDirectory,
    distanceFunction: this.options.distanceFunction
  };
}

/**
 * Check if a file is indexed
 * @param {string} filePath - File path to check
 * @returns {Promise<boolean>}
 */
async isFileIndexed(filePath) {
  if (!this.initialized) {
    await this.initialize();
  }

  const results = await this.collection.get({
    where: { filePath: filePath },
    limit: 1,
    include: []
  });

  return results.ids.length > 0;
}

/**
 * Get all indexed file paths
 * @returns {Promise<string[]>}
 */
async getIndexedFiles() {
  if (!this.initialized) {
    await this.initialize();
  }

  const results = await this.collection.get({
    include: ['metadatas']
  });

  const files = new Set();
  for (const metadata of results.metadatas) {
    if (metadata.filePath) {
      files.add(metadata.filePath);
    }
  }

  return Array.from(files);
}
```

---

### 40.7: Write unit tests (1.5 hours)

**Create:** `tests/code-indexing/vector-store.test.cjs`

```javascript
'use strict';

const { CodeVectorStore } = require('../../.claude/lib/code-indexing/vector-store.cjs');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('CodeVectorStore', () => {
  let store;
  let tempDir;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vector-store-test-'));
    store = new CodeVectorStore({
      persistDirectory: tempDir,
      collectionName: 'test-collection'
    });
    await store.initialize();
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await store.deleteAll();
  });

  describe('Initialization', () => {
    test('initializes successfully', () => {
      expect(store.isInitialized()).toBe(true);
    });
  });

  describe('Adding Chunks', () => {
    test('adds single chunk', async () => {
      const chunk = {
        id: 'test_chunk_1',
        content: 'function test() {}',
        type: 'function',
        language: 'javascript',
        filePath: 'test.js',
        lineStart: 1,
        lineEnd: 1,
        tokenCount: 10,
        name: 'test'
      };
      const embedding = Array(384).fill(0.1);

      const result = await store.addChunk(chunk, embedding);
      const stats = await store.getStats();

      expect(stats.totalChunks).toBe(1);
    });

    test('adds multiple chunks', async () => {
      const items = [
        {
          chunk: { id: 'chunk1', content: 'code1', type: 'function', language: 'javascript', filePath: 'a.js', lineStart: 1, lineEnd: 1, tokenCount: 5 },
          embedding: Array(384).fill(0.1)
        },
        {
          chunk: { id: 'chunk2', content: 'code2', type: 'function', language: 'javascript', filePath: 'b.js', lineStart: 1, lineEnd: 1, tokenCount: 5 },
          embedding: Array(384).fill(0.2)
        }
      ];

      const result = await store.addChunks(items);
      expect(result.added).toBe(2);

      const stats = await store.getStats();
      expect(stats.totalChunks).toBe(2);
    });
  });

  describe('Searching', () => {
    beforeEach(async () => {
      // Add test data
      await store.addChunks([
        {
          chunk: { id: 'js1', content: 'function hello() {}', type: 'function', language: 'javascript', filePath: 'hello.js', lineStart: 1, lineEnd: 1, tokenCount: 10, name: 'hello' },
          embedding: Array(384).fill(0.5)
        },
        {
          chunk: { id: 'py1', content: 'def hello():', type: 'function', language: 'python', filePath: 'hello.py', lineStart: 1, lineEnd: 1, tokenCount: 10, name: 'hello' },
          embedding: Array(384).fill(0.6)
        }
      ]);
    });

    test('searches by embedding', async () => {
      const queryEmbedding = Array(384).fill(0.5);
      const results = await store.search(queryEmbedding, { limit: 5 });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });

    test('filters by language', async () => {
      const queryEmbedding = Array(384).fill(0.5);
      const results = await store.search(queryEmbedding, {
        limit: 5,
        filters: { language: 'javascript' }
      });

      results.forEach(r => {
        expect(r.metadata.language).toBe('javascript');
      });
    });
  });

  describe('Deleting', () => {
    test('deletes by file path', async () => {
      await store.addChunks([
        {
          chunk: { id: 'del1', content: 'code', type: 'function', language: 'javascript', filePath: 'delete-me.js', lineStart: 1, lineEnd: 1, tokenCount: 5 },
          embedding: Array(384).fill(0.1)
        }
      ]);

      const result = await store.deleteByPath('delete-me.js');
      expect(result.deleted).toBe(1);

      const isIndexed = await store.isFileIndexed('delete-me.js');
      expect(isIndexed).toBe(false);
    });
  });

  describe('Statistics', () => {
    test('returns correct stats', async () => {
      const stats = await store.getStats();

      expect(stats.collectionName).toBe('test-collection');
      expect(typeof stats.totalChunks).toBe('number');
    });

    test('tracks indexed files', async () => {
      await store.addChunks([
        {
          chunk: { id: 'f1', content: 'c', type: 'function', language: 'javascript', filePath: 'file1.js', lineStart: 1, lineEnd: 1, tokenCount: 1 },
          embedding: Array(384).fill(0.1)
        },
        {
          chunk: { id: 'f2', content: 'c', type: 'function', language: 'javascript', filePath: 'file2.js', lineStart: 1, lineEnd: 1, tokenCount: 1 },
          embedding: Array(384).fill(0.1)
        }
      ]);

      const files = await store.getIndexedFiles();
      expect(files).toContain('file1.js');
      expect(files).toContain('file2.js');
    });
  });
});
```

---

### 40.8: Update index.cjs exports (15 min)

**Update:** `.claude/lib/code-indexing/index.cjs`

```javascript
const { CodeVectorStore } = require('./vector-store.cjs');

module.exports = {
  // ... existing exports
  CodeVectorStore
};
```

---

### Task #40 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 40.1 Class skeleton | 1h | #36 complete |
| 40.2 Initialization | 1h | 40.1 |
| 40.3 addChunks | 1.5h | 40.2 |
| 40.4 Search | 1.5h | 40.2 |
| 40.5 Delete operations | 1h | 40.2 |
| 40.6 Statistics | 45m | 40.2 |
| 40.7 Unit tests | 1.5h | 40.1-40.6 |
| 40.8 Update exports | 15m | 40.1-40.7 |
| **Total** | **8.5h** | |

---

## Task #41: Implement index-manager.cjs (orchestration)

**Estimated Total Effort:** 14-16 hours
**Dependencies:** Tasks #37, #38, #39, #40 complete
**Blocks:** Task #42 (CLI)

### 41.1-41.9: Implementation subtasks (summarized)

Due to space constraints, Task #41 subtasks are summarized:

| Subtask | Description | Effort |
|---------|-------------|--------|
| 41.1 | IndexManager class skeleton | 1h |
| 41.2 | File discovery (glob patterns) | 1.5h |
| 41.3 | Progress tracking | 1h |
| 41.4 | Full index pipeline | 2.5h |
| 41.5 | Incremental updates | 2h |
| 41.6 | Error handling and recovery | 1.5h |
| 41.7 | Statistics and reporting | 1h |
| 41.8 | Unit tests | 2h |
| 41.9 | Update exports | 15m |
| **Total** | | **12.75h** |

**Key Methods:**
- `fullIndex(options)` - Index entire project
- `incrementalUpdate()` - Update only changed files
- `indexFile(filePath)` - Index single file
- `removeFile(filePath)` - Remove file from index
- `getProgress()` - Get indexing progress
- `getStats()` - Get index statistics

---

## Task #42: Implement index-codebase.cjs (CLI tool)

**Estimated Total Effort:** 6-8 hours
**Dependencies:** Task #41 complete
**Blocks:** Task #43 (Testing)

### 42.1-42.6: Implementation subtasks (summarized)

| Subtask | Description | Effort |
|---------|-------------|--------|
| 42.1 | CLI skeleton with commander | 1h |
| 42.2 | Index command implementation | 2h |
| 42.3 | Search command (optional) | 1.5h |
| 42.4 | Progress bars and output | 1h |
| 42.5 | Error handling | 45m |
| 42.6 | Documentation and help text | 30m |
| **Total** | | **6.75h** |

**CLI Interface:**
```bash
# Full index
node .claude/tools/cli/index-codebase.cjs index

# Index specific directory
node .claude/tools/cli/index-codebase.cjs index --source ./src

# Incremental update
node .claude/tools/cli/index-codebase.cjs update

# Search (optional)
node .claude/tools/cli/index-codebase.cjs search "authentication middleware"

# Statistics
node .claude/tools/cli/index-codebase.cjs stats

# Clear index
node .claude/tools/cli/index-codebase.cjs clear
```

---

## Task #43: Integration Testing and Performance Optimization

**Estimated Total Effort:** 16-20 hours
**Dependencies:** Tasks #36-42 complete
**Blocks:** None (final task)

### 43.1-43.8: Testing and optimization subtasks

| Subtask | Description | Effort |
|---------|-------------|--------|
| 43.1 | Integration test suite setup | 1.5h |
| 43.2 | End-to-end indexing tests | 3h |
| 43.3 | Search accuracy tests | 2h |
| 43.4 | Performance benchmarks | 2h |
| 43.5 | Memory profiling | 1.5h |
| 43.6 | Performance optimization | 3h |
| 43.7 | Documentation updates | 2h |
| 43.8 | Final verification | 1h |
| **Total** | | **16h** |

**Performance Targets:**
- Index 1000 files: <60 seconds
- Query latency: <500ms (cold), <200ms (cached)
- Memory usage: <500MB for 10K files
- Test coverage: >80%

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation | Contingency |
|------|-------------|--------|------------|-------------|
| tree-sitter Windows build fails | Medium | High | Test early on Windows, pin versions | Use pre-built binaries |
| Embedding quality insufficient | Low | High | Test with sample queries early | Add OpenAI fallback option |
| ChromaDB performance issues | Low | Medium | Tune HNSW parameters | Reduce batch size, add caching |
| Large file memory issues | Medium | Medium | Stream processing, chunk limits | Skip files >1MB |
| Model download fails | Low | Low | Retry logic, offline fallback | Use cached model |

---

## Developer Assignment

### Recommended Workflow

**Single Developer:**
1. Days 1-3: Tasks #36, #37 (Foundation)
2. Days 4-6: Tasks #38, #39 (Processing)
3. Days 7-9: Tasks #40, #41 (Storage/Orchestration)
4. Days 10-12: Tasks #42, #43 (CLI/Testing)
5. Days 13-14: Buffer + Optimization

**Two Developers (Parallel):**
- Dev A: #36 -> #37 -> #38 -> #41 -> #42
- Dev B: (wait for #36) -> #39 -> #40 -> #43

### Code Review Checkpoints

| Checkpoint | After Task | Focus |
|------------|------------|-------|
| CP1 | #37 | Parser correctness, error handling |
| CP2 | #38 | Chunking quality, edge cases |
| CP3 | #40 | Vector store integration |
| CP4 | #42 | CLI usability, help text |
| CP5 | #43 | Performance, test coverage |

---

## Success Criteria Summary

### Phase 1 Complete When:

- [ ] All 8 main tasks completed (36-43)
- [ ] All unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] Index 1000 files in <60 seconds
- [ ] Query latency <500ms
- [ ] CLI tool functional and documented
- [ ] Memory usage <500MB for 10K files
- [ ] Code reviewed and approved

### Phase 1 Gate Verification Command:

```bash
# Run all tests
npx jest tests/code-indexing/ --verbose --coverage

# Run performance benchmark
node .claude/tools/cli/index-codebase.cjs index --dry-run

# Verify search works
node .claude/tools/cli/index-codebase.cjs search "function"

# Check stats
node .claude/tools/cli/index-codebase.cjs stats
```

---

## Appendix: File Inventory

After Phase 1 completion, the following files should exist:

```
.claude/
├── config/
│   └── code-index-config.json
├── data/
│   └── code-index/
│       ├── chromadb/          (ChromaDB data)
│       ├── embedding-cache.json
│       └── index-metadata.json
├── lib/
│   └── code-indexing/
│       ├── index.cjs
│       ├── code-parser.cjs
│       ├── semantic-chunker.cjs
│       ├── embedding-generator.cjs
│       ├── vector-store.cjs
│       └── index-manager.cjs
└── tools/
    └── cli/
        └── index-codebase.cjs

tests/
└── code-indexing/
    ├── code-parser.test.cjs
    ├── semantic-chunker.test.cjs
    ├── embedding-generator.test.cjs
    ├── vector-store.test.cjs
    ├── index-manager.test.cjs
    └── integration.test.cjs
```

---

## Memory Protocol

This plan was created following the memory protocol:

**Read before starting:** `.claude/context/memory/learnings.md`

**Recorded decisions:**
- Use Xenova/transformers.js for local embeddings
- Use ChromaDB from existing infrastructure
- CommonJS (.cjs) for all modules
- tree-sitter for multi-language parsing

**Plan location:** `.claude/context/artifacts/PHASE_1_IMPLEMENTATION_PLAN.md`

---

**END OF PLAN**
