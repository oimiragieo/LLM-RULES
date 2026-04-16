// Agent: developer | Task: #2 | Session: 2026-04-13
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  extractSections,
  validateFixedPreserved,
  applyUpdatePreservingFixed,
} = require('../../../.claude/lib/updaters/fixed-section-handler.cjs');

// ---------------------------------------------------------------------------
// extractSections
// ---------------------------------------------------------------------------

describe('extractSections', () => {
  it('returns empty arrays for content with no markers', () => {
    const content = 'Just some text\nwith no markers';
    const result = extractSections(content);
    assert.deepEqual(result.fixed, []);
    assert.deepEqual(result.editable, []);
    assert.ok(result.unmarked.length > 0);
  });

  it('parses a single FIXED block', () => {
    const content = [
      'before',
      '<!-- FIXED: my-section -->',
      'fixed content here',
      '<!-- /FIXED -->',
      'after',
    ].join('\n');

    const result = extractSections(content);
    assert.equal(result.fixed.length, 1);
    assert.equal(result.fixed[0].name, 'my-section');
    assert.ok(result.fixed[0].content.includes('fixed content here'));
  });

  it('parses a single EDITABLE block', () => {
    const content = [
      '<!-- EDITABLE: customization -->',
      'editable content',
      '<!-- /EDITABLE -->',
    ].join('\n');

    const result = extractSections(content);
    assert.equal(result.editable.length, 1);
    assert.equal(result.editable[0].name, 'customization');
    assert.ok(result.editable[0].content.includes('editable content'));
  });

  it('parses multiple FIXED and EDITABLE blocks', () => {
    const content = [
      '<!-- FIXED: section-a -->',
      'fixed a',
      '<!-- /FIXED -->',
      'middle text',
      '<!-- EDITABLE: section-b -->',
      'editable b',
      '<!-- /EDITABLE -->',
      '<!-- FIXED: section-c -->',
      'fixed c',
      '<!-- /FIXED -->',
    ].join('\n');

    const result = extractSections(content);
    assert.equal(result.fixed.length, 2);
    assert.equal(result.fixed[0].name, 'section-a');
    assert.equal(result.fixed[1].name, 'section-c');
    assert.equal(result.editable.length, 1);
    assert.equal(result.editable[0].name, 'section-b');
  });

  it('handles adjacent markers without intervening text', () => {
    const content = [
      '<!-- FIXED: a -->',
      'content a',
      '<!-- /FIXED -->',
      '<!-- EDITABLE: b -->',
      'content b',
      '<!-- /EDITABLE -->',
    ].join('\n');

    const result = extractSections(content);
    assert.equal(result.fixed.length, 1);
    assert.equal(result.editable.length, 1);
  });

  it('handles content with only unmarked text', () => {
    const content = 'line one\nline two\nline three';
    const result = extractSections(content);
    assert.deepEqual(result.fixed, []);
    assert.deepEqual(result.editable, []);
    assert.ok(result.unmarked.some(seg => seg.content.includes('line one')));
  });

  it('records start and end positions for sections', () => {
    const content = [
      'before',
      '<!-- FIXED: foo -->',
      'foo content',
      '<!-- /FIXED -->',
      'after',
    ].join('\n');

    const result = extractSections(content);
    assert.equal(result.fixed.length, 1);
    assert.ok(typeof result.fixed[0].start === 'number');
    assert.ok(typeof result.fixed[0].end === 'number');
    assert.ok(result.fixed[0].start < result.fixed[0].end);
  });

  it('handles FIXED marker with extra whitespace in name', () => {
    const content = ['<!-- FIXED:   spaced-name   -->', 'content', '<!-- /FIXED -->'].join('\n');

    const result = extractSections(content);
    assert.equal(result.fixed.length, 1);
    assert.equal(result.fixed[0].name, 'spaced-name');
  });

  it('returns empty sections for empty string', () => {
    const result = extractSections('');
    assert.deepEqual(result.fixed, []);
    assert.deepEqual(result.editable, []);
    assert.deepEqual(result.unmarked, []);
  });
});

// ---------------------------------------------------------------------------
// validateFixedPreserved
// ---------------------------------------------------------------------------

describe('validateFixedPreserved', () => {
  it('returns ok when no FIXED sections exist', () => {
    const original = 'no markers here';
    const updated = 'different content';
    const result = validateFixedPreserved(original, updated);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('returns ok when FIXED sections are unchanged', () => {
    const original = [
      '<!-- FIXED: header -->',
      'Do not change me',
      '<!-- /FIXED -->',
      'changeable part',
    ].join('\n');
    const updated = [
      '<!-- FIXED: header -->',
      'Do not change me',
      '<!-- /FIXED -->',
      'modified changeable part',
    ].join('\n');

    const result = validateFixedPreserved(original, updated);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('detects violation when FIXED section content is modified', () => {
    const original = [
      '<!-- FIXED: important -->',
      'original fixed content',
      '<!-- /FIXED -->',
    ].join('\n');
    const updated = ['<!-- FIXED: important -->', 'CHANGED fixed content', '<!-- /FIXED -->'].join(
      '\n'
    );

    const result = validateFixedPreserved(original, updated);
    assert.equal(result.valid, false);
    assert.ok(result.violations.length > 0);
    assert.ok(result.violations[0].sectionName === 'important');
  });

  it('detects violation when FIXED section is removed entirely', () => {
    const original = [
      '<!-- FIXED: critical -->',
      'must stay',
      '<!-- /FIXED -->',
      'other content',
    ].join('\n');
    const updated = 'just other content';

    const result = validateFixedPreserved(original, updated);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.sectionName === 'critical'));
  });

  it('allows changes to EDITABLE sections', () => {
    const original = [
      '<!-- FIXED: locked -->',
      'locked content',
      '<!-- /FIXED -->',
      '<!-- EDITABLE: flexible -->',
      'original editable',
      '<!-- /EDITABLE -->',
    ].join('\n');
    const updated = [
      '<!-- FIXED: locked -->',
      'locked content',
      '<!-- /FIXED -->',
      '<!-- EDITABLE: flexible -->',
      'completely new editable content',
      '<!-- /EDITABLE -->',
    ].join('\n');

    const result = validateFixedPreserved(original, updated);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('detects multiple violations', () => {
    const original = [
      '<!-- FIXED: part-a -->',
      'original a',
      '<!-- /FIXED -->',
      '<!-- FIXED: part-b -->',
      'original b',
      '<!-- /FIXED -->',
    ].join('\n');
    const updated = [
      '<!-- FIXED: part-a -->',
      'changed a',
      '<!-- /FIXED -->',
      '<!-- FIXED: part-b -->',
      'changed b',
      '<!-- /FIXED -->',
    ].join('\n');

    const result = validateFixedPreserved(original, updated);
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 2);
  });
});

// ---------------------------------------------------------------------------
// applyUpdatePreservingFixed
// ---------------------------------------------------------------------------

describe('applyUpdatePreservingFixed', () => {
  it('returns updated content unchanged when no FIXED sections exist', () => {
    const original = 'original no markers';
    const updated = 'updated no markers';
    const result = applyUpdatePreservingFixed(original, updated);
    assert.equal(result, updated);
  });

  it('restores FIXED section that was modified in updated content', () => {
    const original = [
      '<!-- FIXED: header -->',
      'original header',
      '<!-- /FIXED -->',
      'rest of document',
    ].join('\n');
    const updated = [
      '<!-- FIXED: header -->',
      'wrongly changed header',
      '<!-- /FIXED -->',
      'updated rest',
    ].join('\n');

    const result = applyUpdatePreservingFixed(original, updated);
    assert.ok(result.includes('original header'));
    assert.ok(!result.includes('wrongly changed header'));
    assert.ok(result.includes('updated rest'));
  });

  it('keeps EDITABLE changes while restoring FIXED sections', () => {
    const original = [
      '<!-- FIXED: locked -->',
      'locked text',
      '<!-- /FIXED -->',
      '<!-- EDITABLE: custom -->',
      'old custom',
      '<!-- /EDITABLE -->',
    ].join('\n');
    const updated = [
      '<!-- FIXED: locked -->',
      'broken locked text',
      '<!-- /FIXED -->',
      '<!-- EDITABLE: custom -->',
      'new custom content',
      '<!-- /EDITABLE -->',
    ].join('\n');

    const result = applyUpdatePreservingFixed(original, updated);
    assert.ok(result.includes('locked text'));
    assert.ok(!result.includes('broken locked text'));
    assert.ok(result.includes('new custom content'));
  });

  it('restores FIXED section removed from updated content', () => {
    const original = [
      '<!-- FIXED: must-exist -->',
      'critical content',
      '<!-- /FIXED -->',
      'other text',
    ].join('\n');
    const updated = 'other text updated';

    const result = applyUpdatePreservingFixed(original, updated);
    assert.ok(result.includes('critical content'));
    assert.ok(result.includes('<!-- FIXED: must-exist -->'));
    assert.ok(result.includes('<!-- /FIXED -->'));
  });

  it('preserves multiple FIXED sections when updated content modifies them', () => {
    const original = [
      '<!-- FIXED: first -->',
      'first fixed',
      '<!-- /FIXED -->',
      'middle',
      '<!-- FIXED: second -->',
      'second fixed',
      '<!-- /FIXED -->',
    ].join('\n');
    const updated = [
      '<!-- FIXED: first -->',
      'first changed',
      '<!-- /FIXED -->',
      'middle updated',
      '<!-- FIXED: second -->',
      'second changed',
      '<!-- /FIXED -->',
    ].join('\n');

    const result = applyUpdatePreservingFixed(original, updated);
    assert.ok(result.includes('first fixed'));
    assert.ok(!result.includes('first changed'));
    assert.ok(result.includes('second fixed'));
    assert.ok(!result.includes('second changed'));
    assert.ok(result.includes('middle updated'));
  });

  it('returns updated content when original has no FIXED sections', () => {
    const original = '<!-- EDITABLE: flex -->\nsome editable\n<!-- /EDITABLE -->';
    const updated = '<!-- EDITABLE: flex -->\nnew editable\n<!-- /EDITABLE -->';
    const result = applyUpdatePreservingFixed(original, updated);
    assert.ok(result.includes('new editable'));
  });
});
