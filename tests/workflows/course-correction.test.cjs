'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

describe('Course Correction Workflow', () => {
  const workflowPath = path.join(ROOT, '.claude/workflows/enterprise/course-correction.md');
  const schemaPath = path.join(ROOT, '.claude/schemas/sprint-change-proposal.schema.json');
  const commandPath = path.join(ROOT, '.claude/commands/correct-course.md');

  test('workflow file exists', () => {
    assert.ok(fs.existsSync(workflowPath), `Workflow file not found at ${workflowPath}`);
  });

  test('schema file exists', () => {
    assert.ok(fs.existsSync(schemaPath), `Schema file not found at ${schemaPath}`);
  });

  test('command file exists', () => {
    assert.ok(fs.existsSync(commandPath), `Command file not found at ${commandPath}`);
  });

  test('workflow contains required phases', () => {
    assert.ok(fs.existsSync(workflowPath), `Workflow file not found at ${workflowPath}`);
    const content = fs.readFileSync(workflowPath, 'utf8').toLowerCase();

    assert.ok(
      /trigger\s+detection/.test(content),
      'Workflow must contain "Trigger Detection" phase'
    );
    assert.ok(
      /impact\s+assessment|impact\s+analysis/.test(content),
      'Workflow must contain "Impact Assessment" phase'
    );
    assert.ok(
      /re[-\s]?plan|replan|revised\s+plan/.test(content),
      'Workflow must contain "Revised Plan" or "Re-plan" phase'
    );
    assert.ok(
      /stakeholder|user.*approval/.test(content),
      'Workflow must contain "Stakeholder Approval" phase'
    );
    assert.ok(/execute/.test(content), 'Workflow must contain "Execute" phase');
  });

  test('schema validates change proposals', () => {
    assert.ok(fs.existsSync(schemaPath), `Schema file not found at ${schemaPath}`);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

    assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#', 'Schema must use draft-07');
    assert.ok(schema.required, 'Schema must have required fields');
    assert.ok(schema.required.includes('reason'), 'Schema must require "reason"');
    assert.ok(schema.required.includes('impact'), 'Schema must require "impact"');
    assert.ok(schema.required.includes('proposedChanges'), 'Schema must require "proposedChanges"');

    const props = schema.properties;
    assert.ok(props, 'Schema must have properties');
    assert.ok(props.impact, 'Schema must have "impact" property');
    assert.ok(props.impact.properties, 'impact must have nested properties');
    assert.ok(props.impact.properties.tasksAffected, '"impact.tasksAffected" must exist');
    assert.equal(
      props.impact.properties.tasksAffected.type,
      'array',
      '"impact.tasksAffected" must be an array'
    );
    assert.ok(props.impact.properties.riskLevel, '"impact.riskLevel" must exist');
    assert.ok(
      Array.isArray(props.impact.properties.riskLevel.enum),
      '"impact.riskLevel" must be an enum'
    );

    assert.ok(props.proposedChanges, 'Schema must have "proposedChanges" property');
    assert.equal(props.proposedChanges.type, 'array', '"proposedChanges" must be an array');
    assert.ok(
      props.proposedChanges.items,
      '"proposedChanges" must have items definition'
    );
    const changeItem = props.proposedChanges.items;
    assert.ok(changeItem.properties, '"proposedChanges" items must have properties');
    assert.ok(changeItem.properties.action, '"proposedChanges[].action" must exist');
    assert.ok(
      Array.isArray(changeItem.properties.action.enum),
      '"proposedChanges[].action" must be an enum'
    );
    assert.ok(changeItem.properties.target, '"proposedChanges[].target" must exist');
    assert.ok(changeItem.properties.rationale, '"proposedChanges[].rationale" must exist');
  });
});
