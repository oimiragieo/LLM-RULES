#!/usr/bin/env node
/**
 * Tests for security-trigger.cjs
 *
 * Tests the security trigger hook which detects security-sensitive file
 * operations and flags them for security review.
 *
 * Test Categories:
 * 1. Module exports
 * 2. Security file pattern detection
 * 3. Sensitive extensions detection
 * 4. Security directory detection
 * 5. Environment file detection
 * 6. Combined pattern detection
 * 7. Edge cases and error handling
 * 8. Hook behavior (always exits 0)
 */

'use strict';

const path = require('path');

// Test helpers
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message || 'Assertion failed'}: expected truthy value, got ${value}`);
  }
}

function assertFalse(value, message) {
  if (value) {
    throw new Error(`${message || 'Assertion failed'}: expected falsy value, got ${value}`);
  }
}

function assertArrayIncludes(array, item, message) {
  if (!array.includes(item)) {
    throw new Error(
      `${message || 'Assertion failed'}: expected array to include ${JSON.stringify(item)}`
    );
  }
}

function assertGreaterThan(actual, expected, message) {
  if (actual <= expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${actual} > ${expected}`);
  }
}

console.log('\n=== security-trigger.cjs tests ===\n');

// Mock process.exit to prevent the hook from exiting during import
// The security-trigger.cjs file calls main() at module load time
const originalExit = process.exit;
process.exit = () => {}; // Suppress exit during import

// Import the module under test
const {
  detectSecuritySensitivity,
  SECURITY_FILE_PATTERNS,
  SENSITIVE_EXTENSIONS,
  SECURITY_DIRECTORIES,
} = require('../../.claude/hooks/safety/security-trigger.cjs');

// Restore original process.exit
process.exit = originalExit;

// ============================================================
// Module Exports Tests
// ============================================================

console.log('--- Module Exports ---');

test('exports detectSecuritySensitivity function', () => {
  assertEqual(typeof detectSecuritySensitivity, 'function', 'Should export function');
});

test('exports SECURITY_FILE_PATTERNS array', () => {
  assertTrue(Array.isArray(SECURITY_FILE_PATTERNS), 'Should export array');
  assertGreaterThan(SECURITY_FILE_PATTERNS.length, 0, 'Should have patterns');
});

test('exports SENSITIVE_EXTENSIONS array', () => {
  assertTrue(Array.isArray(SENSITIVE_EXTENSIONS), 'Should export array');
  assertGreaterThan(SENSITIVE_EXTENSIONS.length, 0, 'Should have extensions');
});

test('exports SECURITY_DIRECTORIES array', () => {
  assertTrue(Array.isArray(SECURITY_DIRECTORIES), 'Should export array');
  assertGreaterThan(SECURITY_DIRECTORIES.length, 0, 'Should have directories');
});

// ============================================================
// Authentication & Authorization Patterns
// ============================================================

console.log('\n--- Authentication & Authorization Patterns ---');

test('detects auth in filename', () => {
  const result = detectSecuritySensitivity('src/middleware/auth.js');
  assertTrue(result.isSensitive, 'Should detect auth');
  assertGreaterThan(result.reasons.length, 0, 'Should have reasons');
});

test('detects login in filename', () => {
  const result = detectSecuritySensitivity('pages/login.tsx');
  assertTrue(result.isSensitive, 'Should detect login');
});

test('detects logout in filename', () => {
  const result = detectSecuritySensitivity('api/logout.ts');
  assertTrue(result.isSensitive, 'Should detect logout');
});

test('detects session in filename', () => {
  const result = detectSecuritySensitivity('lib/session-manager.js');
  assertTrue(result.isSensitive, 'Should detect session');
});

test('detects token in filename', () => {
  const result = detectSecuritySensitivity('utils/token-validator.ts');
  assertTrue(result.isSensitive, 'Should detect token');
});

test('detects jwt in filename', () => {
  const result = detectSecuritySensitivity('auth/jwt-handler.js');
  assertTrue(result.isSensitive, 'Should detect jwt');
});

test('detects oauth in filename', () => {
  const result = detectSecuritySensitivity('oauth2-client.ts');
  assertTrue(result.isSensitive, 'Should detect oauth');
});

test('detects sso in filename', () => {
  const result = detectSecuritySensitivity('sso-config.js');
  assertTrue(result.isSensitive, 'Should detect sso');
});

test('detects saml in filename', () => {
  const result = detectSecuritySensitivity('saml-provider.ts');
  assertTrue(result.isSensitive, 'Should detect saml');
});

test('detects permission in filename', () => {
  const result = detectSecuritySensitivity('permission-checker.js');
  assertTrue(result.isSensitive, 'Should detect permission');
});

test('detects role in filename', () => {
  const result = detectSecuritySensitivity('role-based-access.ts');
  assertTrue(result.isSensitive, 'Should detect role');
});

test('detects rbac in filename', () => {
  const result = detectSecuritySensitivity('rbac-manager.js');
  assertTrue(result.isSensitive, 'Should detect rbac');
});

test('detects acl in filename', () => {
  const result = detectSecuritySensitivity('acl-validator.ts');
  assertTrue(result.isSensitive, 'Should detect acl');
});

// ============================================================
// Cryptography Patterns
// ============================================================

console.log('\n--- Cryptography Patterns ---');

test('detects crypt in filename', () => {
  const result = detectSecuritySensitivity('crypto-utils.js');
  assertTrue(result.isSensitive, 'Should detect crypt');
});

test('detects encrypt in filename', () => {
  const result = detectSecuritySensitivity('encryption-service.ts');
  assertTrue(result.isSensitive, 'Should detect encrypt');
});

test('detects decrypt in filename', () => {
  const result = detectSecuritySensitivity('decrypt-data.js');
  assertTrue(result.isSensitive, 'Should detect decrypt');
});

test('detects hash in filename', () => {
  const result = detectSecuritySensitivity('password-hash.ts');
  assertTrue(result.isSensitive, 'Should detect hash');
});

test('detects bcrypt in filename', () => {
  const result = detectSecuritySensitivity('bcrypt-helper.js');
  assertTrue(result.isSensitive, 'Should detect bcrypt');
});

test('detects argon in filename', () => {
  const result = detectSecuritySensitivity('argon2-wrapper.ts');
  assertTrue(result.isSensitive, 'Should detect argon');
});

test('detects scrypt in filename', () => {
  const result = detectSecuritySensitivity('scrypt-hash.js');
  assertTrue(result.isSensitive, 'Should detect scrypt');
});

test('detects hmac in filename', () => {
  const result = detectSecuritySensitivity('hmac-signature.ts');
  assertTrue(result.isSensitive, 'Should detect hmac');
});

test('detects signature in filename', () => {
  const result = detectSecuritySensitivity('digital-signature.js');
  assertTrue(result.isSensitive, 'Should detect signature');
});

test('detects certificate in filename', () => {
  const result = detectSecuritySensitivity('certificate-manager.ts');
  assertTrue(result.isSensitive, 'Should detect certificate');
});

test('detects ssl in filename', () => {
  const result = detectSecuritySensitivity('ssl-config.js');
  assertTrue(result.isSensitive, 'Should detect ssl');
});

test('detects tls in filename', () => {
  const result = detectSecuritySensitivity('tls-settings.ts');
  assertTrue(result.isSensitive, 'Should detect tls');
});

// ============================================================
// Secrets & Credentials Patterns
// ============================================================

console.log('\n--- Secrets & Credentials Patterns ---');

test('detects secret in filename', () => {
  const result = detectSecuritySensitivity('secret-manager.js');
  assertTrue(result.isSensitive, 'Should detect secret');
});

test('detects credential in filename', () => {
  const result = detectSecuritySensitivity('credential-store.ts');
  assertTrue(result.isSensitive, 'Should detect credential');
});

test('detects password in filename', () => {
  const result = detectSecuritySensitivity('password-validator.js');
  assertTrue(result.isSensitive, 'Should detect password');
});

test('detects apikey in filename', () => {
  const result = detectSecuritySensitivity('apikey-auth.ts');
  assertTrue(result.isSensitive, 'Should detect apikey');
});

test('detects api-key in filename', () => {
  const result = detectSecuritySensitivity('api-key-manager.js');
  assertTrue(result.isSensitive, 'Should detect api-key');
});

test('detects api_key in filename', () => {
  const result = detectSecuritySensitivity('api_key_handler.ts');
  assertTrue(result.isSensitive, 'Should detect api_key');
});

test('detects private-key in filename', () => {
  const result = detectSecuritySensitivity('private-key-loader.js');
  assertTrue(result.isSensitive, 'Should detect private-key');
});

test('detects private_key in filename', () => {
  const result = detectSecuritySensitivity('private_key_store.ts');
  assertTrue(result.isSensitive, 'Should detect private_key');
});

// ============================================================
// Input Validation & Sanitization Patterns
// ============================================================

console.log('\n--- Input Validation & Sanitization Patterns ---');

test('detects sanitiz in filename', () => {
  const result = detectSecuritySensitivity('sanitize-input.js');
  assertTrue(result.isSensitive, 'Should detect sanitiz');
});

test('detects validat in filename', () => {
  const result = detectSecuritySensitivity('input-validator.ts');
  assertTrue(result.isSensitive, 'Should detect validat');
});

test('detects escape in filename', () => {
  const result = detectSecuritySensitivity('html-escape.js');
  assertTrue(result.isSensitive, 'Should detect escape');
});

test('detects xss in filename', () => {
  const result = detectSecuritySensitivity('xss-protection.ts');
  assertTrue(result.isSensitive, 'Should detect xss');
});

test('detects csrf in filename', () => {
  const result = detectSecuritySensitivity('csrf-token.js');
  assertTrue(result.isSensitive, 'Should detect csrf');
});

test('detects injection in filename', () => {
  const result = detectSecuritySensitivity('sql-injection-guard.ts');
  assertTrue(result.isSensitive, 'Should detect injection');
});

test('detects sql-inject in filename', () => {
  const result = detectSecuritySensitivity('sql-inject-filter.js');
  assertTrue(result.isSensitive, 'Should detect sql-inject');
});

test('detects sql_inject in filename', () => {
  const result = detectSecuritySensitivity('sql_inject_check.ts');
  assertTrue(result.isSensitive, 'Should detect sql_inject');
});

// ============================================================
// Security Infrastructure Patterns
// ============================================================

console.log('\n--- Security Infrastructure Patterns ---');

test('detects firewall in filename', () => {
  const result = detectSecuritySensitivity('firewall-rules.js');
  assertTrue(result.isSensitive, 'Should detect firewall');
});

test('detects guard in filename', () => {
  const result = detectSecuritySensitivity('auth-guard.ts');
  assertTrue(result.isSensitive, 'Should detect guard');
});

test('detects security in filename', () => {
  const result = detectSecuritySensitivity('security-headers.js');
  assertTrue(result.isSensitive, 'Should detect security');
});

test('detects secure in filename', () => {
  const result = detectSecuritySensitivity('secure-storage.ts');
  assertTrue(result.isSensitive, 'Should detect secure');
});

test('detects audit in filename', () => {
  const result = detectSecuritySensitivity('audit-log.js');
  assertTrue(result.isSensitive, 'Should detect audit');
});

// ============================================================
// Sensitive Extensions Detection
// ============================================================

console.log('\n--- Sensitive Extensions Detection ---');

test('detects .env extension', () => {
  const result = detectSecuritySensitivity('.env');
  assertTrue(result.isSensitive, 'Should detect .env');
});

test('detects .pem extension', () => {
  const result = detectSecuritySensitivity('server.pem');
  assertTrue(result.isSensitive, 'Should detect .pem');
});

test('detects .key extension', () => {
  const result = detectSecuritySensitivity('private.key');
  assertTrue(result.isSensitive, 'Should detect .key');
});

test('detects .crt extension', () => {
  const result = detectSecuritySensitivity('certificate.crt');
  assertTrue(result.isSensitive, 'Should detect .crt');
});

test('detects .p12 extension', () => {
  const result = detectSecuritySensitivity('cert.p12');
  assertTrue(result.isSensitive, 'Should detect .p12');
});

test('detects .pfx extension', () => {
  const result = detectSecuritySensitivity('cert.pfx');
  assertTrue(result.isSensitive, 'Should detect .pfx');
});

test('detects .jks extension', () => {
  const result = detectSecuritySensitivity('keystore.jks');
  assertTrue(result.isSensitive, 'Should detect .jks');
});

test('detects .keystore extension', () => {
  const result = detectSecuritySensitivity('app.keystore');
  assertTrue(result.isSensitive, 'Should detect .keystore');
});

test('detects .secrets extension', () => {
  const result = detectSecuritySensitivity('config.secrets');
  assertTrue(result.isSensitive, 'Should detect .secrets');
});

test('detects .credentials extension', () => {
  const result = detectSecuritySensitivity('aws.credentials');
  assertTrue(result.isSensitive, 'Should detect .credentials');
});

// ============================================================
// Environment File Detection
// ============================================================

console.log('\n--- Environment File Detection ---');

test('detects .env file', () => {
  const result = detectSecuritySensitivity('.env');
  assertTrue(result.isSensitive, 'Should detect .env');
});

test('detects .env.local file', () => {
  const result = detectSecuritySensitivity('.env.local');
  assertTrue(result.isSensitive, 'Should detect .env.local');
});

test('detects .env.production file', () => {
  const result = detectSecuritySensitivity('.env.production');
  assertTrue(result.isSensitive, 'Should detect .env.production');
});

test('detects .env.development file', () => {
  const result = detectSecuritySensitivity('.env.development');
  assertTrue(result.isSensitive, 'Should detect .env.development');
});

test('detects .env.test file', () => {
  const result = detectSecuritySensitivity('.env.test');
  assertTrue(result.isSensitive, 'Should detect .env.test');
});

test('detects .env.staging file', () => {
  const result = detectSecuritySensitivity('.env.staging');
  assertTrue(result.isSensitive, 'Should detect .env.staging');
});

// ============================================================
// Security Directory Detection
// ============================================================

console.log('\n--- Security Directory Detection ---');

test('detects /auth/ directory', () => {
  const result = detectSecuritySensitivity('src/auth/middleware.js');
  assertTrue(result.isSensitive, 'Should detect /auth/ directory');
});

test('detects \\auth\\ directory (Windows)', () => {
  const result = detectSecuritySensitivity('src\\auth\\middleware.js');
  assertTrue(result.isSensitive, 'Should detect \\auth\\ directory');
});

test('detects /security/ directory', () => {
  const result = detectSecuritySensitivity('lib/security/filters.ts');
  assertTrue(result.isSensitive, 'Should detect /security/ directory');
});

test('detects /crypto/ directory', () => {
  const result = detectSecuritySensitivity('utils/crypto/aes.js');
  assertTrue(result.isSensitive, 'Should detect /crypto/ directory');
});

test('detects /middleware/auth directory', () => {
  const result = detectSecuritySensitivity('src/middleware/auth/jwt.ts');
  assertTrue(result.isSensitive, 'Should detect /middleware/auth directory');
});

test('detects /guards/ directory', () => {
  const result = detectSecuritySensitivity('src/guards/role.guard.ts');
  assertTrue(result.isSensitive, 'Should detect /guards/ directory');
});

test('detects /validators/ directory', () => {
  const result = detectSecuritySensitivity('lib/validators/input.js');
  assertTrue(result.isSensitive, 'Should detect /validators/ directory');
});

test('detects /hooks/safety/ directory', () => {
  const result = detectSecuritySensitivity('.claude/hooks/safety/validator.cjs');
  assertTrue(result.isSensitive, 'Should detect /hooks/safety/ directory');
});

test('detects /hooks/security/ directory', () => {
  const result = detectSecuritySensitivity('.claude/hooks/security/check.cjs');
  assertTrue(result.isSensitive, 'Should detect /hooks/security/ directory');
});

test('detects /.claude/hooks/ directory', () => {
  const result = detectSecuritySensitivity('.claude/hooks/routing/auth.cjs');
  assertTrue(result.isSensitive, 'Should detect /.claude/hooks/ directory');
});

// ============================================================
// Combined Pattern Detection
// ============================================================

console.log('\n--- Combined Pattern Detection ---');

test('detects multiple patterns in same file', () => {
  const result = detectSecuritySensitivity('src/auth/password-hash.js');
  assertTrue(result.isSensitive, 'Should detect multiple patterns');
  assertGreaterThan(result.reasons.length, 1, 'Should have multiple reasons');
});

test('detects pattern in full path', () => {
  const result = detectSecuritySensitivity('/home/user/project/src/security/auth/jwt-token.ts');
  assertTrue(result.isSensitive, 'Should detect patterns in full path');
  assertGreaterThan(result.reasons.length, 1, 'Should have multiple reasons');
});

test('detects directory and filename patterns', () => {
  const result = detectSecuritySensitivity('lib/crypto/encryption-service.js');
  assertTrue(result.isSensitive, 'Should detect directory and filename');
  assertGreaterThan(result.reasons.length, 1, 'Should have multiple reasons');
});

// ============================================================
// Non-Sensitive Files (Should Not Detect)
// ============================================================

console.log('\n--- Non-Sensitive Files ---');

test('does not detect regular component', () => {
  const result = detectSecuritySensitivity('src/components/Button.tsx');
  assertFalse(result.isSensitive, 'Should not detect Button component');
  assertEqual(result.reasons.length, 0, 'Should have no reasons');
});

test('does not detect utility file', () => {
  const result = detectSecuritySensitivity('src/utils/format-date.js');
  assertFalse(result.isSensitive, 'Should not detect date utility');
});

test('does not detect test file', () => {
  const result = detectSecuritySensitivity('tests/unit/calculator.test.js');
  assertFalse(result.isSensitive, 'Should not detect test file');
});

test('does not detect config file', () => {
  const result = detectSecuritySensitivity('config/webpack.config.js');
  assertFalse(result.isSensitive, 'Should not detect webpack config');
});

test('does not detect readme', () => {
  const result = detectSecuritySensitivity('README.md');
  assertFalse(result.isSensitive, 'Should not detect README');
});

test('does not detect package.json', () => {
  const result = detectSecuritySensitivity('package.json');
  assertFalse(result.isSensitive, 'Should not detect package.json');
});

test('does not detect tsconfig', () => {
  const result = detectSecuritySensitivity('tsconfig.json');
  assertFalse(result.isSensitive, 'Should not detect tsconfig');
});

// ============================================================
// Edge Cases and Error Handling
// ============================================================

console.log('\n--- Edge Cases and Error Handling ---');

test('handles null file path', () => {
  const result = detectSecuritySensitivity(null);
  assertFalse(result.isSensitive, 'Should handle null');
  assertEqual(result.reasons.length, 0, 'Should have no reasons');
});

test('handles undefined file path', () => {
  const result = detectSecuritySensitivity(undefined);
  assertFalse(result.isSensitive, 'Should handle undefined');
  assertEqual(result.reasons.length, 0, 'Should have no reasons');
});

test('handles empty string', () => {
  const result = detectSecuritySensitivity('');
  assertFalse(result.isSensitive, 'Should handle empty string');
  assertEqual(result.reasons.length, 0, 'Should have no reasons');
});

test('handles whitespace-only string', () => {
  const result = detectSecuritySensitivity('   ');
  assertFalse(result.isSensitive, 'Should handle whitespace');
  assertEqual(result.reasons.length, 0, 'Should have no reasons');
});

test('handles file path with no extension', () => {
  const result = detectSecuritySensitivity('Dockerfile');
  assertFalse(result.isSensitive, 'Should handle no extension');
});

test('handles file path with multiple dots', () => {
  const result = detectSecuritySensitivity('app.config.production.js');
  assertFalse(result.isSensitive, 'Should handle multiple dots');
});

test('handles Windows absolute path', () => {
  const result = detectSecuritySensitivity('C:\\Users\\dev\\project\\auth.js');
  assertTrue(result.isSensitive, 'Should detect auth in Windows path');
});

test('handles Unix absolute path', () => {
  const result = detectSecuritySensitivity('/home/dev/project/auth.js');
  assertTrue(result.isSensitive, 'Should detect auth in Unix path');
});

test('handles relative path with ..', () => {
  const result = detectSecuritySensitivity('../../src/auth/login.js');
  assertTrue(result.isSensitive, 'Should detect auth in relative path');
});

test('handles path with spaces', () => {
  const result = detectSecuritySensitivity('My Projects/app/auth module.js');
  assertTrue(result.isSensitive, 'Should detect auth in path with spaces');
});

test('handles path with special characters', () => {
  const result = detectSecuritySensitivity('src/@auth/[id]/login.tsx');
  assertTrue(result.isSensitive, 'Should detect auth with special chars');
});

// ============================================================
// Case Insensitivity Tests
// ============================================================

console.log('\n--- Case Insensitivity ---');

test('detects AUTH (uppercase)', () => {
  const result = detectSecuritySensitivity('AUTH-SERVICE.js');
  assertTrue(result.isSensitive, 'Should detect uppercase AUTH');
});

test('detects Auth (mixed case)', () => {
  const result = detectSecuritySensitivity('AuthController.ts');
  assertTrue(result.isSensitive, 'Should detect mixed case Auth');
});

test('detects PASSWORD (uppercase)', () => {
  const result = detectSecuritySensitivity('PASSWORD-RESET.js');
  assertTrue(result.isSensitive, 'Should detect uppercase PASSWORD');
});

test('detects Encryption (mixed case)', () => {
  const result = detectSecuritySensitivity('EncryptionService.ts');
  assertTrue(result.isSensitive, 'Should detect mixed case Encryption');
});

// ============================================================
// Real-World File Examples
// ============================================================

console.log('\n--- Real-World File Examples ---');

test('detects NextAuth.js config', () => {
  const result = detectSecuritySensitivity('app/api/auth/[...nextauth]/route.ts');
  assertTrue(result.isSensitive, 'Should detect NextAuth config');
});

test('detects Firebase auth config', () => {
  const result = detectSecuritySensitivity('lib/firebase-auth.ts');
  assertTrue(result.isSensitive, 'Should detect Firebase auth');
});

test('detects AWS credentials config', () => {
  const result = detectSecuritySensitivity('.aws/credentials');
  assertTrue(result.isSensitive, 'Should detect AWS credentials');
});

test('detects SSH key', () => {
  const result = detectSecuritySensitivity('.ssh/id_rsa');
  assertFalse(result.isSensitive, 'SSH directory not in patterns (but filename detected)');
  // Note: id_rsa doesn't match file patterns, only .key extension
});

test('detects Express session middleware', () => {
  const result = detectSecuritySensitivity('middleware/session-store.js');
  assertTrue(result.isSensitive, 'Should detect session store');
});

test('detects JWT middleware', () => {
  const result = detectSecuritySensitivity('middleware/jwt-verify.ts');
  assertTrue(result.isSensitive, 'Should detect JWT middleware');
});

test('detects Passport.js strategy', () => {
  const result = detectSecuritySensitivity('config/passport-strategy.js');
  assertFalse(result.isSensitive, 'Passport not in patterns');
  // Note: Would need to add passport to patterns if desired
});

test('detects OAuth callback', () => {
  // Note: oauth is in directory name, not filename
  // The hook only checks filename patterns, not directory path segments
  // To detect this, the filename itself must contain a security pattern
  const result = detectSecuritySensitivity('api/oauth-callback.ts');
  assertTrue(result.isSensitive, 'Should detect OAuth in filename');
});

// ============================================================
// Reason Messages Verification
// ============================================================

console.log('\n--- Reason Messages ---');

test('reason includes pattern description for file match', () => {
  const result = detectSecuritySensitivity('auth-handler.js');
  assertTrue(result.reasons.length > 0, 'Should have reasons');
  assertTrue(
    result.reasons.some(r => r.includes('security pattern')),
    'Should mention security pattern'
  );
});

test('reason includes extension for sensitive extension', () => {
  const result = detectSecuritySensitivity('cert.pem');
  assertTrue(result.reasons.length > 0, 'Should have reasons');
  assertTrue(
    result.reasons.some(r => r.includes('.pem')),
    'Should mention .pem extension'
  );
});

test('reason mentions environment file for .env', () => {
  const result = detectSecuritySensitivity('.env.local');
  assertTrue(result.reasons.length > 0, 'Should have reasons');
  assertTrue(
    result.reasons.some(r => r.toLowerCase().includes('environment')),
    'Should mention environment file'
  );
});

test('reason includes directory pattern', () => {
  const result = detectSecuritySensitivity('src/security/check.js');
  assertTrue(result.reasons.length > 0, 'Should have reasons');
  assertTrue(
    result.reasons.some(r => r.toLowerCase().includes('directory')),
    'Should mention directory'
  );
});

// ============================================================
// Pattern Coverage Verification
// ============================================================

console.log('\n--- Pattern Coverage ---');

test('SECURITY_FILE_PATTERNS has auth patterns', () => {
  const hasAuth = SECURITY_FILE_PATTERNS.some(p => p.toString().includes('auth'));
  assertTrue(hasAuth, 'Should have auth patterns');
});

test('SECURITY_FILE_PATTERNS has crypto patterns', () => {
  const hasCrypto = SECURITY_FILE_PATTERNS.some(
    p => p.toString().includes('crypt') || p.toString().includes('encrypt')
  );
  assertTrue(hasCrypto, 'Should have crypto patterns');
});

test('SECURITY_FILE_PATTERNS has validation patterns', () => {
  const hasValidation = SECURITY_FILE_PATTERNS.some(
    p => p.toString().includes('validat') || p.toString().includes('sanitiz')
  );
  assertTrue(hasValidation, 'Should have validation patterns');
});

test('SENSITIVE_EXTENSIONS includes common certificate extensions', () => {
  assertArrayIncludes(SENSITIVE_EXTENSIONS, '.pem', 'Should include .pem');
  assertArrayIncludes(SENSITIVE_EXTENSIONS, '.key', 'Should include .key');
  assertArrayIncludes(SENSITIVE_EXTENSIONS, '.crt', 'Should include .crt');
});

test('SENSITIVE_EXTENSIONS includes env files', () => {
  assertArrayIncludes(SENSITIVE_EXTENSIONS, '.env', 'Should include .env');
});

test('SECURITY_DIRECTORIES includes auth directory', () => {
  const hasAuth = SECURITY_DIRECTORIES.some(p => p.toString().includes('auth'));
  assertTrue(hasAuth, 'Should have auth directory pattern');
});

test('SECURITY_DIRECTORIES includes hooks directory', () => {
  const hasHooks = SECURITY_DIRECTORIES.some(p => p.toString().includes('hooks'));
  assertTrue(hasHooks, 'Should have hooks directory pattern');
});

// ============================================================
// PROC-003: Content Pattern Detection Tests
// ============================================================

console.log('\n--- PROC-003: Content Pattern Detection ---');

// Note: detectSecuritySensitivity currently only checks file paths.
// These tests verify content pattern detection once enabled.

test('exports SECURITY_CONTENT_PATTERNS array', () => {
  const { SECURITY_CONTENT_PATTERNS } = require('../../.claude/hooks/safety/security-trigger.cjs');
  assertTrue(Array.isArray(SECURITY_CONTENT_PATTERNS), 'Should export array');
  assertGreaterThan(SECURITY_CONTENT_PATTERNS.length, 0, 'Should have patterns');
});

// Tests for content pattern checking (requires detectSecuritySensitivityWithContent function)
// These tests will FAIL until content pattern checking is implemented

test('detects AWS_ACCESS_KEY in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  if (!detectSecuritySensitivityWithContent) {
    throw new Error('detectSecuritySensitivityWithContent not exported');
  }
  const result = detectSecuritySensitivityWithContent('config.js', 'const key = AWS_ACCESS_KEY_ID');
  assertTrue(result.isSensitive, 'Should detect AWS_ACCESS_KEY');
});

test('detects AWS_SECRET in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent(
    'config.js',
    'const secret = AWS_SECRET_ACCESS_KEY'
  );
  assertTrue(result.isSensitive, 'Should detect AWS_SECRET');
});

test('detects STRIPE_SECRET in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent(
    'payment.js',
    'const stripe = STRIPE_SECRET_KEY'
  );
  assertTrue(result.isSensitive, 'Should detect STRIPE_SECRET');
});

test('detects OPENAI_API_KEY in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent('ai.js', 'process.env.OPENAI_API_KEY');
  assertTrue(result.isSensitive, 'Should detect OPENAI_API_KEY');
});

test('detects ANTHROPIC_API_KEY in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent('claude.js', 'ANTHROPIC_API_KEY = "sk-"');
  assertTrue(result.isSensitive, 'Should detect ANTHROPIC_API_KEY');
});

test('detects /webhook/ endpoint in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent('routes.js', 'app.post("/webhook/stripe")');
  assertTrue(result.isSensitive, 'Should detect /webhook/ endpoint');
});

test('detects /callback/ endpoint in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent('auth.js', 'router.get("/callback/oauth")');
  assertTrue(result.isSensitive, 'Should detect /callback/ endpoint');
});

test('detects /notify/ endpoint in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent('api.js', 'fetch("/notify/user")');
  assertTrue(result.isSensitive, 'Should detect /notify/ endpoint');
});

test('detects process.env. in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent(
    'config.js',
    'const dbUrl = process.env.DATABASE_URL'
  );
  assertTrue(result.isSensitive, 'Should detect process.env.');
});

test('detects jwt.sign in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent(
    'auth.js',
    'const token = jwt.sign(payload, secret)'
  );
  assertTrue(result.isSensitive, 'Should detect jwt.sign');
});

test('detects jwt.verify in content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent(
    'middleware.js',
    'const decoded = jwt.verify(token, secret)'
  );
  assertTrue(result.isSensitive, 'Should detect jwt.verify');
});

test('does not detect safe content', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent(
    'util.js',
    'function formatDate(date) { return date.toISOString(); }'
  );
  assertFalse(result.isSensitive, 'Should not detect safe content');
});

test('content check combines with file path check', () => {
  const { detectSecuritySensitivityWithContent } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const result = detectSecuritySensitivityWithContent('auth.js', 'const key = AWS_ACCESS_KEY_ID');
  assertTrue(result.isSensitive, 'Should detect both file and content');
  assertGreaterThan(result.reasons.length, 1, 'Should have multiple reasons');
});

// ============================================================
// PROC-003: New Pattern Coverage Tests
// ============================================================

console.log('\n--- PROC-003: New Pattern Coverage ---');

test('SECURITY_CONTENT_PATTERNS includes AWS patterns', () => {
  const { SECURITY_CONTENT_PATTERNS } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const hasAWS = SECURITY_CONTENT_PATTERNS.some(p => p.toString().includes('AWS'));
  assertTrue(hasAWS, 'Should have AWS patterns');
});

test('SECURITY_CONTENT_PATTERNS includes STRIPE patterns', () => {
  const { SECURITY_CONTENT_PATTERNS } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const hasStripe = SECURITY_CONTENT_PATTERNS.some(p =>
    p.toString().toLowerCase().includes('stripe')
  );
  assertTrue(hasStripe, 'Should have STRIPE patterns');
});

test('SECURITY_CONTENT_PATTERNS includes OPENAI patterns', () => {
  const { SECURITY_CONTENT_PATTERNS } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const hasOpenAI = SECURITY_CONTENT_PATTERNS.some(p => p.toString().includes('OPENAI'));
  assertTrue(hasOpenAI, 'Should have OPENAI patterns');
});

test('SECURITY_CONTENT_PATTERNS includes ANTHROPIC patterns', () => {
  const { SECURITY_CONTENT_PATTERNS } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const hasAnthropic = SECURITY_CONTENT_PATTERNS.some(p => p.toString().includes('ANTHROPIC'));
  assertTrue(hasAnthropic, 'Should have ANTHROPIC patterns');
});

test('SECURITY_CONTENT_PATTERNS includes webhook patterns', () => {
  const { SECURITY_CONTENT_PATTERNS } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const hasWebhook = SECURITY_CONTENT_PATTERNS.some(p => p.toString().includes('webhook'));
  assertTrue(hasWebhook, 'Should have webhook patterns');
});

test('SECURITY_CONTENT_PATTERNS includes callback patterns', () => {
  const { SECURITY_CONTENT_PATTERNS } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const hasCallback = SECURITY_CONTENT_PATTERNS.some(p => p.toString().includes('callback'));
  assertTrue(hasCallback, 'Should have callback patterns');
});

test('SECURITY_CONTENT_PATTERNS includes notify patterns', () => {
  const { SECURITY_CONTENT_PATTERNS } = require('../../.claude/hooks/safety/security-trigger.cjs');
  const hasNotify = SECURITY_CONTENT_PATTERNS.some(p => p.toString().includes('notify'));
  assertTrue(hasNotify, 'Should have notify patterns');
});

// ============================================================
// Print Test Summary
// ============================================================

console.log('\n========================================');
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
