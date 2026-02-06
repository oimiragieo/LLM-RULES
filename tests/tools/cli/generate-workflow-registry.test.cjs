#!/usr/bin/env node
/**
 * Tests for Workflow Registry Generator
 *
 * Following TDD: Write tests first, then implement.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const GENERATOR_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'tools',
  'cli',
  'generate-workflow-registry.cjs'
);

describe('Workflow Registry Generator', () => {
  let generator;

  before(() => {
    // Import the generator module
    generator = require(GENERATOR_PATH);
  });

  describe('scanWorkflowFiles', () => {
    it('should find all .md workflow files', () => {
      const mdFiles = generator.scanWorkflowFiles('.md');
      assert.ok(Array.isArray(mdFiles), 'Should return an array');
      assert.ok(mdFiles.length > 0, 'Should find at least one .md workflow file');
      assert.ok(
        mdFiles.every(f => f.endsWith('.md')),
        'All files should end with .md'
      );
    });

    it('should find all .yaml workflow files', () => {
      const yamlFiles = generator.scanWorkflowFiles('.yaml');
      assert.ok(Array.isArray(yamlFiles), 'Should return an array');
      assert.ok(yamlFiles.length > 0, 'Should find at least one .yaml workflow file');
      assert.ok(
        yamlFiles.every(f => f.endsWith('.yaml')),
        'All files should end with .yaml'
      );
    });

    it('should return relative paths from workflows directory', () => {
      const mdFiles = generator.scanWorkflowFiles('.md');
      assert.ok(
        mdFiles.every(f => !f.startsWith('C:') && !f.startsWith('/')),
        'Paths should be relative'
      );
    });
  });

  describe('extractWorkflowMetadata', () => {
    it('should extract metadata from markdown workflow', () => {
      const metadata = generator.extractWorkflowMetadata('core/router-decision.md', 'md');
      assert.ok(metadata, 'Should return metadata');
      assert.strictEqual(metadata.path, 'core/router-decision.md');
      assert.strictEqual(metadata.category, 'core');
      assert.ok(['sequential', 'parallel', 'phased', 'state-machine'].includes(metadata.type));
      assert.ok(metadata.description, 'Should have a description');
    });

    it('should extract metadata from YAML workflow', () => {
      const metadata = generator.extractWorkflowMetadata(
        'creators/workflow-creator-workflow.yaml',
        'yaml'
      );
      assert.ok(metadata, 'Should return metadata');
      assert.strictEqual(metadata.path, 'creators/workflow-creator-workflow.yaml');
      assert.strictEqual(metadata.category, 'creators');
    });

    it('should detect required agents from workflow content', () => {
      const metadata = generator.extractWorkflowMetadata('core/evolution-workflow.md', 'md');
      assert.ok(Array.isArray(metadata.requiredAgents), 'Should have requiredAgents array');
    });
  });

  describe('generateRegistry', () => {
    it('should generate valid registry structure', () => {
      const registry = generator.generateRegistry();
      assert.ok(registry, 'Should return registry');
      assert.ok(registry.version, 'Should have version');
      assert.ok(registry.lastUpdated, 'Should have lastUpdated');
      assert.ok(registry.workflows, 'Should have workflows object');
    });

    it('should include core workflows', () => {
      const registry = generator.generateRegistry();
      const workflowNames = Object.keys(registry.workflows);
      assert.ok(
        workflowNames.some(n => n.includes('router-decision')),
        'Should include router-decision'
      );
      assert.ok(
        workflowNames.some(n => n.includes('evolve-workflow')),
        'Should include evolve-workflow'
      );
      assert.ok(
        workflowNames.some(n => n.includes('reflection-workflow')),
        'Should include reflection-workflow'
      );
    });

    it('should include enterprise workflows', () => {
      const registry = generator.generateRegistry();
      const enterpriseWorkflows = Object.values(registry.workflows).filter(
        w => w.category === 'enterprise'
      );
      assert.ok(enterpriseWorkflows.length > 0, 'Should have enterprise workflows');
    });

    it('should count total workflows correctly', () => {
      const registry = generator.generateRegistry();
      const mdCount = generator.scanWorkflowFiles('.md').length;
      const yamlCount = generator.scanWorkflowFiles('.yaml').length;
      const totalInRegistry = Object.keys(registry.workflows).length;
      // Registry should have all workflows minus README.md
      assert.ok(
        totalInRegistry >= mdCount + yamlCount - 2,
        `Registry should have most workflows. Found ${totalInRegistry}, expected ~${mdCount + yamlCount}`
      );
    });
  });

  describe('validateRegistry', () => {
    it('should validate that all workflow paths exist', () => {
      const registry = generator.generateRegistry();
      const errors = generator.validateRegistry(registry);
      assert.strictEqual(errors.length, 0, `Registry should have no errors: ${errors.join(', ')}`);
    });

    it('should detect missing workflow files', () => {
      const badRegistry = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        workflows: {
          'nonexistent-workflow': {
            path: 'nonexistent/workflow.md',
            category: 'core',
            type: 'sequential',
            description: 'Does not exist',
            status: 'active',
          },
        },
      };
      const errors = generator.validateRegistry(badRegistry);
      assert.ok(errors.length > 0, 'Should detect missing workflow file');
    });
  });
});
