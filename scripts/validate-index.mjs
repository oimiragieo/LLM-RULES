#!/usr/bin/env node
/**
 * Wrapper for validate-rule-index-paths.mjs
 * Maintains stable external API while scripts are organized internally
 *
 * Note: Previously delegated to validation/validate-index.mjs which was
 * a subset of validate-rule-index-paths.mjs. Merged during Pipeline #8.
 */
import './validation/validate-rule-index-paths.mjs';
