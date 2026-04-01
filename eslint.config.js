/**
 * ESLint Configuration (Flat Config - ESLint 9+)
 *
 * Lints JavaScript/CommonJS/ESM files for code quality issues.
 * Runs alongside prettier (formatting) and security-lint (security).
 *
 * Usage:
 *   pnpm lint          - Check all files
 *   pnpm lint:fix      - Auto-fix issues
 *   pnpm lint:staged   - Check staged files only
 */

import js from '@eslint/js';

export default [
  // Apply recommended rules to all JS files
  js.configs.recommended,

  // Global configuration
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        // Node.js timers and utilities
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    rules: {
      // Error Prevention
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],

      // Pattern matching - allow control characters in regex (used for path validation)
      'no-control-regex': 'off',

      // Switch statements - allow lexical declarations in case blocks
      'no-case-declarations': 'off',

      // Switch statements - intentional fallthrough is common in state machines
      'no-fallthrough': 'warn',

      // Async/Await
      'require-await': 'warn',
      'no-async-promise-executor': 'error',

      // Best Practices
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',

      // Complexity
      complexity: ['warn', 20],
      'max-depth': ['warn', 4],
      'max-nested-callbacks': ['warn', 4],

      // Module Size Budget (ADR-121)
      // Set to 'warn' initially because routing-guard.cjs (2,473 lines) and
      // create.cjs (3,677 lines) exceed the budget. Escalate to 'error'
      // by 2026-06-30 after module split milestones complete.
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],

      // Node.js Specific
      'no-console': 'off', // CLI tools need console
    },
  },

  // Ignore patterns (replaces .eslintignore)
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '.next/',
      '.nuxt/',
      'tests/fixtures/',
      'tests/**/fixtures/', // code-indexing and other test fixtures (created/removed by tests)
      '.claude/lib/utils/.claude/staging/',
      '.claude/staging/',
      'vendor/',
      '.claude.archive/', // Archived legacy code
      '.claude.old/', // Archived legacy code
      '.claude/worktrees/**', // Isolated worktree directories
      '.claude/context/tmp/**', // Temporary scripts, not production code
      '**/*.ts', // TypeScript files — no TS parser configured; these are doc/example files only
      'rename_agent.cjs', // Untracked in-progress utility script
      'revert_rename.cjs', // Untracked in-progress utility script
      'update_frequencies.cjs', // Untracked in-progress utility script
      'update_skill_loops.cjs', // Untracked in-progress utility script
      'update_skill_rigidity.cjs', // Untracked in-progress utility script
      'run-group1-test.cjs', // Untracked debug/test runner script
      'run-memory-tests.cjs', // Untracked debug/test runner script
      'run-memory-tests.js', // Untracked debug/test runner script
      '.tmp/**', // Session temp scripts (not production code, not tracked)
      'scripts/maintenance/patch-hook-exits.cjs', // Untracked in-progress maintenance script
    ],
  },

  // Test files - relax some rules
  {
    files: ['**/*.test.{js,cjs,mjs}', '**/__tests__/**/*.{js,cjs,mjs}', 'tests/**/*.{mjs,cjs,js}'],
    languageOptions: {
      globals: {
        // Node.js test runner globals (for files that don't import them)
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        before: 'readonly',
        after: 'readonly',
        mock: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      'no-unused-expressions': 'off',
      'max-nested-callbacks': 'off',
      'max-depth': 'off', // Tests can have deeply nested structures
      'require-await': 'off', // Async tests may not always await
      // Allow redeclaring test globals (some files import them, some use globals)
      'no-redeclare': ['error', { builtinGlobals: false }],
      // Test files often have unused variables for setup/mocking
      'no-unused-vars': [
        'warn', // Downgrade to warning for tests
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern:
            '^(_|fs|path|mock|beforeEach|afterEach|before|after|jest|assert|result|exitCode|stdout|stderr)',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // CommonJS files - adjust source type
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'script',
    },
  },

  // Skill scripts - template patterns have unused imports by design
  {
    files: [
      '.claude/skills/**/scripts/main.cjs',
      '.claude/skills/**/hooks/pre-execute.cjs',
      '.claude/skills/**/hooks/post-execute.cjs',
      '.cursor/skills/**/scripts/*.mjs', // Cursor skills mirror claude skills
    ],
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^(_|fs|path|PROJECT_ROOT|SCHEMAS_DIR|basename)',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Hooks - allow unused parseHookInput (common pattern for hooks that may not need input)
  // Also allow higher complexity since hooks often contain complex validation logic
  {
    files: ['.claude/hooks/**/*.cjs'],
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^(_|fs|path|parseHookInput|parseHookInputSync|parseHookInputAsync)',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Hooks often have async for consistent API even without await
      'require-await': 'off',
      // Hooks contain complex routing/validation logic - allow higher thresholds
      complexity: ['warn', 50],
      'max-depth': ['warn', 6],
    },
  },

  // Tools and analysis scripts - allow higher complexity
  {
    files: ['.claude/tools/**/*.{js,cjs,mjs}', '.cursor/**/*.{js,cjs,mjs}', 'scripts/**/*.mjs'],
    rules: {
      complexity: ['warn', 35],
      'max-depth': ['warn', 10], // Tools can have deep nesting for complex operations
      'require-await': 'off', // Many async functions are for API consistency
    },
  },

  // Validation scripts - complex by nature, disable complexity check entirely
  // This override MUST come after the tools override to take precedence
  {
    files: ['**/scripts/validation/**/*.mjs', '.claude/tools/cli/validate-*.{cjs,mjs}'],
    rules: {
      complexity: 'off', // Validation scripts can have very high complexity (many checks)
    },
  },

  // Browser/DOM scripts - need browser globals
  {
    files: ['**/*pptx*.js', '**/*html2*.js', '**/*dom*.js', '**/*browser*.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        Node: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        NodeList: 'readonly',
        DOMParser: 'readonly',
        XMLSerializer: 'readonly',
      },
    },
    rules: {
      complexity: 'off', // DOM manipulation can be complex
      'require-await': 'off', // DOM scripts may have async for API consistency
    },
  },

  // Library/utility files - allow more complexity, disable require-await
  {
    files: ['.claude/lib/**/*.{js,cjs,mjs}'],
    rules: {
      complexity: ['warn', 50],
      'max-depth': ['warn', 8],
      'require-await': 'off',
      'no-fallthrough': 'off', // State machines use intentional fallthrough
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^(_|fs|path)',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Skill-creator scripts - complex transformation logic
  {
    files: ['.claude/skills/skill-creator/scripts/*.cjs'],
    rules: {
      complexity: ['warn', 40],
      'max-depth': ['warn', 8],
    },
  },

  // Schema-creator scripts - schema generation is inherently complex
  {
    files: ['.claude/skills/schema-creator/scripts/*.cjs'],
    rules: {
      complexity: ['warn', 30],
    },
  },

  // Claude Code agent-runtime scripts - use native Claude Code tool globals
  // (CronList, CronCreate, CronDelete, TaskUpdate, etc. are injected by the Claude Code runtime)
  {
    files: [
      '.claude/context/runtime/**/*.cjs',
      '.claude/tools/cli/heartbeat-orchestrator-register.cjs',
      '.claude/tools/cron-runner/**/*.cjs',
    ],
    languageOptions: {
      globals: {
        CronList: 'readonly',
        CronCreate: 'readonly',
        CronDelete: 'readonly',
        TaskUpdate: 'readonly',
        TaskCreate: 'readonly',
        TaskList: 'readonly',
        TaskGet: 'readonly',
      },
    },
  },

  // Advanced elicitation tests - allow method variable for destructuring
  {
    files: ['.claude/skills/advanced-elicitation/**/*.{js,mjs,cjs}'],
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^(_|fs|path|method|result|afterEach|beforeEach)',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // JSON safety remediation guardrail (Phase 3): ban raw JSON.parse in remediated utility files.

  {
    files: [
      '.claude/scripts/quick-status.cjs',

      '.claude/scripts/validate-routing-consistency.cjs',

      '.claude/scripts/verify-hook-modules.cjs',

      '.claude/lib/utils/package-manager.cjs',

      '.claude/lib/utils/state-cache.cjs',

      '.claude/lib/utils/hook-resolver.cjs',

      '.claude/lib/utils/schema-validator.cjs',

      '.claude/lib/routing/semantic-router.cjs',

      '.claude/lib/routing/agent-registry-resolver.cjs',

      '.claude/lib/quality/artifact-quality-runtime.cjs',

      '.claude/lib/qa/report.cjs',

      '.claude/lib/memory/observations.cjs',

      '.claude/lib/memory/intent-analyzer.cjs',

      '.claude/lib/evolution-state-sync.cjs',

      '.claude/tools/cli/doctor.mjs',

      '.claude/tools/chrome-browser/chrome-browser.cjs',

      '.claude/tools/analysis/project-analyzer/analyzer.mjs',

      '.claude/tools/analysis/ecosystem-assessor/assess-ecosystem.mjs',

      '.claude/tools/analysis/ecosystem-assessor/hook-assessor.mjs',

      '.claude/tools/analysis/ecosystem-assessor/mcp-discoverer.mjs',

      '.claude/tools/visualization/diagram-generator/scripts/generate.mjs',

      '.claude/tools/run-agent-framework-integration-headless.mjs',

      '.claude/tools/analysis/repo-rag/scripts/search-formatters.mjs',

      '.claude/tools/validate-latest-integration-artifacts.mjs',
    ],

    rules: {
      'no-restricted-syntax': [
        'error',

        {
          selector: "CallExpression[callee.object.name='JSON'][callee.property.name='parse']",

          message:
            'Use safeParseJSON from .claude/lib/utils/safe-json.cjs instead of raw JSON.parse.',
        },
      ],
    },
  },

  // Telegram CLI tools — self-contained polling scripts with inline command handlers.
  // These legitimately exceed the default 500-line limit; raising to 650 for this glob.
  {
    files: [
      '.claude/tools/cli/telegram-poll.cjs',
      '.claude/tools/cli/telegram-claude-bridge.cjs',
      '.claude/tools/cli/telegram-command-router.cjs',
    ],
    rules: {
      'max-lines': ['warn', { max: 650, skipBlankLines: true, skipComments: true }],
    },
  },
];
