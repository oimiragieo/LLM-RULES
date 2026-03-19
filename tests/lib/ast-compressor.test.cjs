/* global performance */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  compressFunction,
  compressClass,
  compressModule,
  CompressionLevel,
} = require('../../.claude/lib/compression/ast-compressor.cjs');

// ─── CompressionLevel ───────────────────────────────────────────────────────

describe('CompressionLevel', () => {
  it('exports levels', () => {
    assert.equal(CompressionLevel.SIGNATURES, 'signatures');
    assert.equal(CompressionLevel.STRUCTURE, 'structure');
    assert.equal(CompressionLevel.SUMMARY, 'summary');
  });
});

// ─── compressFunction ───────────────────────────────────────────────────────

describe('compressFunction', () => {
  it('extracts function signature', () => {
    const code =
      'function calculateTax(total, rate) {\n  const tax = total * rate;\n  return tax;\n}';
    const result = compressFunction(code);
    assert.ok(result.includes('calculateTax'));
    assert.ok(result.includes('total'));
    assert.ok(result.includes('rate'));
  });

  it('extracts arrow function signature', () => {
    const code = 'const add = (a, b) => {\n  return a + b;\n};';
    const result = compressFunction(code);
    assert.ok(result.includes('add'));
    assert.ok(result.includes('a'));
  });

  it('preserves JSDoc if present', () => {
    const code = '/** @param {number} x */\nfunction square(x) { return x * x; }';
    const result = compressFunction(code, { preserveJsdoc: true });
    assert.ok(result.includes('@param'));
  });

  it('strips implementation body', () => {
    const code =
      'function complex(x) {\n  const a = 1;\n  const b = 2;\n  if (x > 0) { return a; }\n  return b;\n}';
    const result = compressFunction(code);
    assert.ok(!result.includes('const a = 1'));
    assert.ok(result.length < code.length);
  });

  it('handles empty function', () => {
    const code = 'function empty() {}';
    const result = compressFunction(code);
    assert.ok(result.includes('empty'));
  });

  it('handles async function', () => {
    const code =
      'async function fetchData(url) {\n  const res = await fetch(url);\n  return res.json();\n}';
    const result = compressFunction(code);
    assert.ok(result.includes('async'));
    assert.ok(result.includes('fetchData'));
  });
});

// ─── compressClass ──────────────────────────────────────────────────────────

describe('compressClass', () => {
  it('extracts class name and methods', () => {
    const code = `class UserService {
  constructor(db) { this.db = db; }
  async findById(id) { return this.db.find(id); }
  async create(data) { return this.db.insert(data); }
}`;
    const result = compressClass(code);
    assert.ok(result.includes('UserService'));
    assert.ok(result.includes('constructor'));
    assert.ok(result.includes('findById'));
    assert.ok(result.includes('create'));
  });

  it('strips method bodies', () => {
    const code = `class Foo {
  bar() {
    const x = 1;
    const y = 2;
    return x + y;
  }
}`;
    const result = compressClass(code);
    assert.ok(!result.includes('const x = 1'));
  });

  it('handles extends', () => {
    const code = 'class Admin extends User { getRole() { return "admin"; } }';
    const result = compressClass(code);
    assert.ok(result.includes('Admin'));
    assert.ok(result.includes('extends'));
    assert.ok(result.includes('User'));
  });
});

// ─── compressModule ─────────────────────────────────────────────────────────

describe('compressModule', () => {
  it('extracts exports', () => {
    const code = `
const A = 1;
function helper() { return 42; }
class Service { run() {} }
module.exports = { A, helper, Service };
`;
    const result = compressModule(code, { level: CompressionLevel.SIGNATURES });
    assert.ok(result.includes('helper'));
    assert.ok(result.includes('Service'));
  });

  it('SUMMARY level is shorter than SIGNATURES', () => {
    const code = `
function a(x) { return x + 1; }
function b(x, y) { return x * y; }
function c(x, y, z) { return x + y + z; }
module.exports = { a, b, c };
`;
    const sig = compressModule(code, { level: CompressionLevel.SIGNATURES });
    const sum = compressModule(code, { level: CompressionLevel.SUMMARY });
    assert.ok(sum.length <= sig.length);
  });

  it('STRUCTURE level includes file outline', () => {
    const code = `
const config = require('./config');
class Foo { bar() {} baz() {} }
function helper() {}
module.exports = { Foo, helper };
`;
    const result = compressModule(code, { level: CompressionLevel.STRUCTURE });
    assert.ok(result.includes('Foo'));
    assert.ok(result.includes('helper'));
  });

  it('handles empty module', () => {
    const result = compressModule('', { level: CompressionLevel.SIGNATURES });
    assert.equal(typeof result, 'string');
  });

  it('compression ratio is significant', () => {
    const longCode = Array.from(
      { length: 50 },
      (_, i) =>
        `function fn${i}(a, b, c) {\n  const x = a + b;\n  const y = x * c;\n  if (y > 100) {\n    return y - 50;\n  }\n  return y;\n}`
    ).join('\n');
    const result = compressModule(longCode, { level: CompressionLevel.SIGNATURES });
    const ratio = result.length / longCode.length;
    assert.ok(ratio < 0.6, `Ratio ${ratio.toFixed(2)} should be < 0.6`);
  });

  it('performance: compress 100-function module under 20ms', () => {
    const code = Array.from(
      { length: 100 },
      (_, i) => `function fn${i}(a${i}) { return a${i} * 2; }`
    ).join('\n');
    const start = performance.now();
    compressModule(code, { level: CompressionLevel.SIGNATURES });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 20, `Took ${elapsed.toFixed(2)}ms`);
  });
});
