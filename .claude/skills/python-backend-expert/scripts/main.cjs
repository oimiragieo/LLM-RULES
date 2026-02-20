#!/usr/bin/env node
/**
 * python-backend-expert - Enterprise Bundle Script
 * Domain: Python backend (FastAPI, Django, Flask, SQLAlchemy 2.0, async patterns)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`
python-backend-expert - Expert Skill CLI

Usage:
  node main.cjs --validate <file>   Check Python file for type annotation coverage and async patterns
  node main.cjs --analyze <file>    Detect framework, Python version, and key dependencies
  node main.cjs --help              Show this help

Description:
  Python backend expert including FastAPI, Django, Flask, SQLAlchemy 2.0, and async patterns.
  Covers modern toolchain (uv, ruff, mypy, pyproject.toml) and Python 3.12+ type hints (PEP 695).

Domain Rules:
  - FastAPI: always use async def for I/O-bound endpoint handlers
  - SQLAlchemy 2.0: use select() not Query API; use async sessions
  - Type annotations required on all function signatures
  - Pydantic v2: use model_config = ConfigDict(...), @field_validator
  - Use uv for dependency management, ruff for linting/formatting, mypy for type checking
`);
  process.exit(0);
}

if (args.includes('--validate')) {
  const filePath = args[args.indexOf('--validate') + 1];
  if (!filePath) {
    console.error('Error: --validate requires a file path argument');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const lines = source.split('\n');
  const results = {
    file: filePath,
    checks: [],
  };

  // Check for type annotations on function definitions
  const funcDefs = lines.filter(l => /^\s*(?:async\s+)?def\s+\w+/.test(l));
  const annotatedFuncs = funcDefs.filter(l => /->\s*\S+/.test(l) || /\(.*:\s*\S/.test(l));
  const annotationCoverage =
    funcDefs.length > 0
      ? Math.round((annotatedFuncs.length / funcDefs.length) * 100) + '%'
      : 'N/A (no functions)';

  results.checks.push({
    check: 'type_annotation_coverage',
    value: annotationCoverage,
    status: funcDefs.length === 0 || annotatedFuncs.length === funcDefs.length ? 'ok' : 'warn',
  });

  // Check for async patterns
  const asyncDefs = lines.filter(l => /^\s*async\s+def\s+/.test(l));
  const syncDefs = lines.filter(l => /^\s*def\s+/.test(l));
  results.checks.push({
    check: 'async_function_count',
    value: asyncDefs.length,
    status: 'info',
  });
  results.checks.push({
    check: 'sync_function_count',
    value: syncDefs.length,
    status: 'info',
  });

  // Check for bare except
  const bareExcept = lines.filter(l => /^\s*except\s*:/.test(l));
  results.checks.push({
    check: 'bare_except_clauses',
    value: bareExcept.length,
    status: bareExcept.length > 0 ? 'warn' : 'ok',
  });

  // Check for print() in production code (should use logging)
  const printCalls = lines.filter(l => /(?<![#'"]).print\(/.test(l));
  results.checks.push({
    check: 'print_statements',
    value: printCalls.length,
    status: printCalls.length > 0 ? 'warn' : 'ok',
  });

  // Check for deprecated SQLAlchemy Query API
  const queryApi = lines.filter(l => /session\.query\s*\(/.test(l));
  results.checks.push({
    check: 'deprecated_sqlalchemy_query_api',
    value: queryApi.length,
    status: queryApi.length > 0 ? 'warn' : 'ok',
    note: queryApi.length > 0 ? 'Use select() instead of session.query() in SQLAlchemy 2.0+' : '',
  });

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

if (args.includes('--analyze')) {
  const filePath = args[args.indexOf('--analyze') + 1];
  if (!filePath) {
    console.error('Error: --analyze requires a file path argument');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const result = {
    file: filePath,
    frameworkDetected: null,
    pythonVersionHint: null,
    asyncMode: false,
    keyDependencies: [],
  };

  // Framework detection
  if (/from fastapi|import fastapi/i.test(source)) {
    result.frameworkDetected = 'fastapi';
  } else if (/from django|import django/i.test(source)) {
    result.frameworkDetected = 'django';
  } else if (/from flask|import flask/i.test(source)) {
    result.frameworkDetected = 'flask';
  } else if (/from litestar|import litestar/i.test(source)) {
    result.frameworkDetected = 'litestar';
  }

  // Python version hint from match statement (3.10+) or PEP 695 syntax (3.12+)
  if (/^\s*type\s+\w+\[/m.test(source)) {
    result.pythonVersionHint = '>=3.12 (PEP 695 type alias syntax detected)';
  } else if (/^\s*match\s+/m.test(source)) {
    result.pythonVersionHint = '>=3.10 (match statement detected)';
  }

  // Async mode
  result.asyncMode = /async\s+def\s+/.test(source);

  // Key dependencies
  const imports = [
    ...source.matchAll(
      /^(?:import|from)\s+(sqlalchemy|pydantic|alembic|celery|redis|httpx|aiohttp|tortoise|uvicorn|gunicorn|starlette|motor|beanie|pymongo|psycopg|asyncpg|aiosqlite)/gm
    ),
  ];
  result.keyDependencies = [...new Set(imports.map(m => m[1]))];

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(
  'python-backend-expert skill loaded. Use --help for usage, --validate <file> or --analyze <file>.'
);
