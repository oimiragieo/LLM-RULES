#!/usr/bin/env node
/**
 * Tests for Security Lint Tool
 *
 * Validates that security-lint.cjs correctly detects security issues
 * in code files for pre-commit hook integration.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Import the module under test
const {
  SECURITY_RULES,
  scanFile,
  shouldScanFile,
  shouldSkipScanning,
  extractSecurityLintIgnoreDirective,
  CONFIG,
} = require('../../../.claude/tools/cli/security-lint.cjs');

// =============================================================================
// Test Utilities
// =============================================================================

const TEST_DIR = path.join(__dirname, '../../../tests/temp');
let testCounter = 0;

function setup() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function createTestFile(content, extension = '.js') {
  testCounter++;
  const filePath = path.join(TEST_DIR, `test-${testCounter}${extension}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(`  ${err.message}`);
    return false;
  }
}

// =============================================================================
// Tests
// =============================================================================

function testSecurityRulesExist() {
  assert(Array.isArray(SECURITY_RULES), 'SECURITY_RULES should be an array');
  assert(SECURITY_RULES.length > 0, 'Should have at least one security rule');

  // Check rule structure
  for (const rule of SECURITY_RULES) {
    assert(rule.id, `Rule should have an id: ${JSON.stringify(rule)}`);
    assert(rule.name, `Rule ${rule.id} should have a name`);
    assert(rule.severity, `Rule ${rule.id} should have a severity`);
    assert(rule.pattern instanceof RegExp, `Rule ${rule.id} should have a RegExp pattern`);
    assert(rule.description, `Rule ${rule.id} should have a description`);
    assert(rule.fix, `Rule ${rule.id} should have a fix suggestion`);
  }
}

function testShouldScanFileExtensions() {
  // Create test files with different extensions
  const jsFile = createTestFile('console.log("test");', '.js');
  const cjsFile = createTestFile('console.log("test");', '.cjs');
  const txtFile = createTestFile('test content', '.txt');
  const unknownFile = createTestFile('test content', '.xyz');

  assert(shouldScanFile(jsFile), 'Should scan .js files');
  assert(shouldScanFile(cjsFile), 'Should scan .cjs files');
  assert(shouldScanFile(txtFile), 'Should scan .txt files');
  assert(!shouldScanFile(unknownFile), 'Should not scan unknown extensions');
}

function testScanFileDetectsHardcodedApiKey() {
  const content = `
    const apiKey = "sk-abc123def456ghi789jkl012mno345";
    fetch('/api', { headers: { 'Authorization': apiKey } });
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  assert(findings.length > 0, 'Should detect hardcoded API key');

  const apiKeyFinding = findings.find(f => f.ruleId === 'SEC-001');
  assert(apiKeyFinding, 'Should match SEC-001 rule');
  assert(apiKeyFinding.severity === 'critical', 'API key should be critical severity');
}

function testScanFileDetectsHardcodedPassword() {
  const content = `
    const password = "mysecretpassword123";
    db.connect({ password });
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const pwdFinding = findings.find(f => f.ruleId === 'SEC-002');
  assert(pwdFinding, 'Should detect hardcoded password (SEC-002)');
  assert(pwdFinding.severity === 'critical', 'Password should be critical severity');
}

function testScanFileDetectsPrivateKey() {
  const content = `
    const key = \`-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7...
-----END PRIVATE KEY-----\`;
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const keyFinding = findings.find(f => f.ruleId === 'SEC-003');
  assert(keyFinding, 'Should detect private key (SEC-003)');
}

function testScanFileDetectsAwsCredentials() {
  const content = `
    const accessKeyId = "AKIAIOSFODNN7EXAMPLE";
    const secretKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const awsFinding = findings.find(f => f.ruleId === 'SEC-004');
  assert(awsFinding, 'Should detect AWS credentials (SEC-004)');
}

function testScanFileDetectsEvalUsage() {
  const content = `
    const result = eval(userInput);
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const evalFinding = findings.find(f => f.ruleId === 'SEC-012');
  assert(evalFinding, 'Should detect eval() usage (SEC-012)');
  assert(evalFinding.severity === 'high', 'eval should be high severity');
}

function testScanFileDetectsFunctionConstructor() {
  const content = `
    const fn = new Function('a', 'return a * 2');
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const fnFinding = findings.find(f => f.ruleId === 'SEC-013');
  assert(fnFinding, 'Should detect Function constructor (SEC-013)');
}

function testScanFileCleanFileNoFindings() {
  const content = `
    const API_KEY = process.env.API_KEY;
    const password = process.env.DB_PASSWORD;

    function safeFunction(input) {
      return input.trim();
    }
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  assert(findings.length === 0, 'Clean file should have no findings');
}

function testScanFileReportsLineNumbers() {
  const content = `line1
line2
const apiKey = "sk-abc123def456ghi789jkl012mno345";
line4`;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  assert(findings.length > 0, 'Should have findings');
  assert(findings[0].line === 3, `Should report line 3, got ${findings[0].line}`);
}

function testConfigHasScanExtensions() {
  assert(Array.isArray(CONFIG.scanExtensions), 'CONFIG.scanExtensions should be array');
  assert(CONFIG.scanExtensions.includes('.js'), 'Should include .js');
  assert(CONFIG.scanExtensions.includes('.cjs'), 'Should include .cjs');
  assert(CONFIG.scanExtensions.includes('.ts'), 'Should include .ts');
  assert(CONFIG.scanExtensions.includes('.env'), 'Should include .env');
}

function testConfigHasSkipDirs() {
  assert(Array.isArray(CONFIG.skipDirs), 'CONFIG.skipDirs should be array');
  assert(CONFIG.skipDirs.includes('node_modules'), 'Should skip node_modules');
  assert(CONFIG.skipDirs.includes('.git'), 'Should skip .git');
}

function testScanFileDetectsHttpWithoutTls() {
  const content = `
    const url = "http://example.com/api";
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const httpFinding = findings.find(f => f.ruleId === 'SEC-020');
  assert(httpFinding, 'Should detect HTTP without TLS (SEC-020)');
  assert(httpFinding.severity === 'medium', 'HTTP should be medium severity');
}

function testScanFileAllowsLocalhost() {
  const content = `
    const url = "http://localhost:3000/api";
    const url2 = "http://127.0.0.1:8080/test";
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const httpFindings = findings.filter(f => f.ruleId === 'SEC-020');
  assert(httpFindings.length === 0, 'Should allow localhost HTTP');
}

function testScanFileDetectsDisabledSsl() {
  const content = `
    const agent = new https.Agent({
      rejectUnauthorized: false
    });
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const sslFinding = findings.find(f => f.ruleId === 'SEC-021');
  assert(sslFinding, 'Should detect disabled SSL (SEC-021)');
  assert(sslFinding.severity === 'high', 'Disabled SSL should be high severity');
}

function testScanFileDetectsPrototypePollution() {
  const content = `
    obj["__proto__"] = maliciousPayload;
    obj["constructor"]["prototype"] = evil;
  `;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const protoFindings = findings.filter(f => f.ruleId === 'SEC-050');
  assert(protoFindings.length >= 1, 'Should detect prototype pollution (SEC-050)');
}

function testDoesNotSkipIgnoreDirectiveOutsideAllowlist() {
  const content = `// security-lint-ignore
const apiKey = "sk-abc123def456ghi789jkl012mno345";
`;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  assert(findings.length > 0, 'Should not skip non-allowlisted file with ignore directive');
}

function testSkipsAllowlistedIgnoreDirectiveWithReason() {
  const content = `// security-lint-ignore: intentional security fixture
const apiKey = "sk-abc123def456ghi789jkl012mno345";
`;
  const allowlistedPath = 'tests/scripts/install-security.test.cjs';
  assert(
    shouldSkipScanning(allowlistedPath, content),
    'Should skip allowlisted file with explicit ignore reason'
  );
}

function testSkipsSecurityLintTestFiles() {
  // Test that files ending in .test.cjs/js that reference security-lint are skipped
  const content = `
const { SECURITY_RULES, scanFile } = require('../../../.claude/tools/cli/security-lint.cjs');
const apiKey = "sk-abc123def456ghi789jkl012mno345";
`;
  const filePath = createTestFile(content, '.test.cjs');

  const findings = scanFile(filePath);
  assert(findings.length === 0, 'Should skip security-lint test files');
}

function testDoesNotSkipRegularTestFiles() {
  // Regular test files (not testing security-lint) should still be scanned
  const content = `
describe('auth tests', () => {
  const apiKey = "sk-abc123def456ghi789jkl012mno345";
});
`;
  const filePath = createTestFile(content, '.test.js');

  const findings = scanFile(filePath);
  assert(findings.length > 0, 'Should scan regular test files that may contain security issues');
}

function testShouldSkipScanningFunction() {
  // Test the shouldSkipScanning function directly
  assert(
    !shouldSkipScanning('file.js', '// security-lint-ignore\ncode'),
    'Should not skip non-allowlisted JS comment directive'
  );
  assert(
    !shouldSkipScanning('file.js', '/* security-lint-ignore */\ncode'),
    'Should not skip non-allowlisted block comment directive'
  );
  assert(
    !shouldSkipScanning('file.sh', '# security-lint-ignore\ncode'),
    'Should not skip non-allowlisted shell comment directive'
  );
  assert(
    shouldSkipScanning(
      'tests/lib/workflow/decision-handler-security.test.cjs',
      '// security-lint-ignore: intentional security fixture\ncode'
    ),
    'Should skip allowlisted directive with reason'
  );
  assert(
    !shouldSkipScanning(
      'tests/lib/workflow/decision-handler-security.test.cjs',
      '// security-lint-ignore\ncode'
    ),
    'Should require a reason for allowlisted ignore directive'
  );
  assert(
    shouldSkipScanning('file.test.js', 'const {SECURITY_RULES} = require("security-lint");'),
    'Should skip test file referencing SECURITY_RULES'
  );
  assert(!shouldSkipScanning('file.js', 'const x = 1;'), 'Should not skip regular file');
  assert(
    !shouldSkipScanning('file.test.js', 'describe("tests", () => {});'),
    'Should not skip regular test file'
  );
}

function testExtractSecurityLintIgnoreDirective() {
  const withReason = extractSecurityLintIgnoreDirective(
    '// security-lint-ignore: because this file contains test payloads\nconst x = 1;'
  );
  assert(withReason, 'Directive with reason should parse');
  assert(withReason.reason.length > 0, 'Reason should be captured');

  const withoutReason = extractSecurityLintIgnoreDirective('// security-lint-ignore\nconst x = 1;');
  assert(withoutReason, 'Directive without reason should parse');
  assert.strictEqual(withoutReason.reason, '', 'Missing reason should be an empty string');
}

function testSkipsEvalInDocumentationMarkdown() {
  // .md files in docs/skills/agents should not be scanned for eval() or new Function()
  const content = `# Security Rules

Do NOT use \`eval()\` or \`new Function()\` in production code.

Example of what NOT to do:
\`\`\`javascript
const result = eval(userInput); // BAD
const fn = new Function('x', 'return x * 2'); // BAD
\`\`\`
`;
  const filePath = createTestFile(content, '.md');

  const findings = scanFile(filePath);
  const codeInjectionFindings = findings.filter(
    f => f.ruleId === 'SEC-012' || f.ruleId === 'SEC-013'
  );
  assert(codeInjectionFindings.length === 0, 'Should not flag eval/Function in .md docs');
}

function testSkipsEvalInMemoryJson() {
  // Memory/learnings JSON files should not be scanned for eval() or new Function()
  const content = `{
  "patterns": [
    "Avoid eval() for dynamic code execution",
    "Never use new Function() with untrusted input"
  ]
}`;
  const filePath = createTestFile(content, '.json');

  const findings = scanFile(filePath);
  const codeInjectionFindings = findings.filter(
    f => f.ruleId === 'SEC-012' || f.ruleId === 'SEC-013'
  );
  assert(
    codeInjectionFindings.length === 0,
    'Should not flag eval/Function mentions in .json docs'
  );
}

function testSkipsHttpInSchemaJson() {
  // .schema.json files use http://json-schema.org/ URIs by convention
  const content = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "name": { "type": "string" }
  }
}`;
  const filePath = createTestFile(content, '.schema.json');

  const findings = scanFile(filePath);
  const httpFindings = findings.filter(f => f.ruleId === 'SEC-020');
  assert(httpFindings.length === 0, 'Should not flag http:// in .schema.json files');
}

function testStillScansEvalInCodeFiles() {
  // Code files (.js, .ts, etc.) should still be scanned for eval()
  const content = `const result = eval(userInput);`;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const evalFindings = findings.filter(f => f.ruleId === 'SEC-012');
  assert(evalFindings.length > 0, 'Should still detect eval() in .js files');
}

function testDoesNotFlagMethodChainedEval() {
  // SEC-012 must NOT fire on method-chained .eval() calls (e.g., PyTorch model.eval())
  const content = [
    'model.eval()',
    'self.eval()',
    'obj.eval()',
    'model.eval().train()',
  ].join('\n');
  const filePath = createTestFile(content, '.py');

  const findings = scanFile(filePath);
  const evalFindings = findings.filter(f => f.ruleId === 'SEC-012');
  assert(
    evalFindings.length === 0,
    'Should NOT flag method-chained .eval() calls (false-positive regression)'
  );
}

function testStillScansHttpInCodeFiles() {
  // Code files should still be scanned for http:// (non-localhost)
  const content = `const url = "http://example.com/api";`;
  const filePath = createTestFile(content, '.js');

  const findings = scanFile(filePath);
  const httpFindings = findings.filter(f => f.ruleId === 'SEC-020');
  assert(httpFindings.length > 0, 'Should still detect http:// in .js files');
}

// =============================================================================
// Main Test Runner
// =============================================================================

function main() {
  console.log('=== Security Lint Tests ===\n');

  setup();

  const tests = [
    ['Security rules exist and have correct structure', testSecurityRulesExist],
    ['shouldScanFile filters by extension', testShouldScanFileExtensions],
    ['Detects hardcoded API key (SEC-001)', testScanFileDetectsHardcodedApiKey],
    ['Detects hardcoded password (SEC-002)', testScanFileDetectsHardcodedPassword],
    ['Detects private key (SEC-003)', testScanFileDetectsPrivateKey],
    ['Detects AWS credentials (SEC-004)', testScanFileDetectsAwsCredentials],
    ['Detects eval() usage (SEC-012)', testScanFileDetectsEvalUsage],
    ['Detects Function constructor (SEC-013)', testScanFileDetectsFunctionConstructor],
    ['Clean file has no findings', testScanFileCleanFileNoFindings],
    ['Reports correct line numbers', testScanFileReportsLineNumbers],
    ['CONFIG has scan extensions', testConfigHasScanExtensions],
    ['CONFIG has skip directories', testConfigHasSkipDirs],
    ['Detects HTTP without TLS (SEC-020)', testScanFileDetectsHttpWithoutTls],
    ['Allows localhost HTTP', testScanFileAllowsLocalhost],
    ['Detects disabled SSL (SEC-021)', testScanFileDetectsDisabledSsl],
    ['Detects prototype pollution (SEC-050)', testScanFileDetectsPrototypePollution],
    [
      'Does not skip ignore directive outside allowlist',
      testDoesNotSkipIgnoreDirectiveOutsideAllowlist,
    ],
    [
      'Skips allowlisted ignore directive with reason',
      testSkipsAllowlistedIgnoreDirectiveWithReason,
    ],
    ['Skips security-lint test files', testSkipsSecurityLintTestFiles],
    ['Does not skip regular test files', testDoesNotSkipRegularTestFiles],
    ['shouldSkipScanning function works correctly', testShouldSkipScanningFunction],
    [
      'extractSecurityLintIgnoreDirective parses directive reasons',
      testExtractSecurityLintIgnoreDirective,
    ],
    ['Skips eval() in documentation .md files', testSkipsEvalInDocumentationMarkdown],
    ['Skips eval() in memory .json files', testSkipsEvalInMemoryJson],
    ['Skips http:// in .schema.json files', testSkipsHttpInSchemaJson],
    ['Still scans eval() in code files', testStillScansEvalInCodeFiles],
    ['Does not flag method-chained .eval() (SEC-012 false-positive)', testDoesNotFlagMethodChainedEval],
    ['Still scans http:// in code files', testStillScansHttpInCodeFiles],
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) {
      passed++;
    } else {
      failed++;
    }
  }

  cleanup();

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();

module.exports = { runTest };
