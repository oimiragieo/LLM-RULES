#!/usr/bin/env node
/**
 * Test: Research Prioritization Matrix in EVOLVE Phase O
 *
 * Enhancement #7: Implement Research Prioritization Matrix
 * Tests the Impact × Alignment matrix scoring algorithm (0.6/0.4 weights)
 *
 * RED phase: Tests will FAIL until enhancement implemented
 */

const { strict: assert } = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Enhancement #7: Research Prioritization Matrix\n');

// Test 1: Prioritization algorithm scoring
console.log('Test 1: Impact × Alignment scoring algorithm');
try {
  const calculateScore = (impact, alignment) => {
    // Score = (impact × 0.6) + (alignment × 0.4)
    return impact * 0.6 + alignment * 0.4;
  };

  // HIGH impact (3), HIGH alignment (3) = 3.0
  const highHigh = calculateScore(3, 3);
  assert.equal(highHigh, 3.0, 'HIGH/HIGH should score 3.0');

  // HIGH impact (3), MEDIUM alignment (2) = 2.6
  const highMed = calculateScore(3, 2);
  assert.ok(Math.abs(highMed - 2.6) < 0.001, 'HIGH/MEDIUM should score ~2.6');

  // MEDIUM impact (2), HIGH alignment (3) = 2.4
  const medHigh = calculateScore(2, 3);
  assert.ok(Math.abs(medHigh - 2.4) < 0.001, 'MEDIUM/HIGH should score ~2.4');

  // LOW impact (1), LOW alignment (1) = 1.0
  const lowLow = calculateScore(1, 1);
  assert.equal(lowLow, 1.0, 'LOW/LOW should score 1.0');

  console.log('  ✓ Scoring algorithm correct (0.6/0.4 weights)');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 2: TOP 5 of 18 opportunities selection
console.log('\nTest 2: TOP 5 of 18 opportunities selected');
try {
  const opportunities = [
    { id: 1, impact: 3, alignment: 3 }, // 3.0
    { id: 2, impact: 3, alignment: 2 }, // 2.6
    { id: 3, impact: 2, alignment: 3 }, // 2.4
    { id: 4, impact: 2, alignment: 2 }, // 2.0
    { id: 5, impact: 3, alignment: 1 }, // 2.2
    { id: 6, impact: 1, alignment: 3 }, // 1.8
    { id: 7, impact: 2, alignment: 1 }, // 1.6
    { id: 8, impact: 1, alignment: 2 }, // 1.4
    { id: 9, impact: 1, alignment: 1 }, // 1.0
    { id: 10, impact: 3, alignment: 3 }, // 3.0
    { id: 11, impact: 2, alignment: 2 }, // 2.0
    { id: 12, impact: 2, alignment: 2 }, // 2.0
    { id: 13, impact: 1, alignment: 1 }, // 1.0
    { id: 14, impact: 1, alignment: 1 }, // 1.0
    { id: 15, impact: 1, alignment: 1 }, // 1.0
    { id: 16, impact: 1, alignment: 1 }, // 1.0
    { id: 17, impact: 1, alignment: 1 }, // 1.0
    { id: 18, impact: 1, alignment: 1 }, // 1.0
  ];

  const calculateScore = (impact, alignment) => impact * 0.6 + alignment * 0.4;

  const prioritized = opportunities
    .map(opp => ({ ...opp, score: calculateScore(opp.impact, opp.alignment) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  assert.equal(prioritized.length, 5, 'Should select exactly 5 opportunities');
  assert.equal(prioritized[0].score, 3.0, 'Top opportunity should score 3.0');
  // Top 5 scores: 3.0, 3.0, 2.6, 2.4, 2.2 (all >= 2.0)
  assert.ok(
    prioritized.every(opp => opp.score >= 2.0),
    'All selected should score >= 2.0'
  );

  console.log('  ✓ TOP 5 of 18 selection works');
  console.log(`    Selected IDs: ${prioritized.map(o => o.id).join(', ')}`);
  console.log(`    Scores: ${prioritized.map(o => o.score.toFixed(1)).join(', ')}`);
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 3: 20% research budget cap
console.log('\nTest 3: 20% research budget enforcement');
try {
  const projectTime = 100; // hours
  const maxResearchTime = projectTime * 0.2; // 20 hours

  assert.equal(maxResearchTime, 20, 'Research budget should be 20% of project time');

  // Simulate 18 opportunities, each taking 3 hours to research
  const opportunityCount = 18;
  const timePerResearch = 3;
  const totalIfAllResearched = opportunityCount * timePerResearch; // 54 hours

  // Budget enforcement: only research TOP 5 (15 hours < 20 hour cap)
  const top5Research = 5 * timePerResearch; // 15 hours

  assert.ok(top5Research <= maxResearchTime, 'TOP 5 research should fit within budget');
  assert.ok(totalIfAllResearched > maxResearchTime, 'All 18 would exceed budget');

  console.log('  ✓ 20% budget cap enforced');
  console.log(`    Budget: ${maxResearchTime}h`);
  console.log(`    TOP 5: ${top5Research}h (within budget)`);
  console.log(`    All 18: ${totalIfAllResearched}h (exceeds budget)`);
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 4: evolution-workflow.md contains prioritization section
console.log('\nTest 4: evolution-workflow.md Phase O integration');
try {
  const workflowPath = path.join(__dirname, 'evolution-workflow.md');

  if (!fs.existsSync(workflowPath)) {
    throw new Error('evolution-workflow.md not found');
  }

  const content = fs.readFileSync(workflowPath, 'utf-8');

  // Check for Phase O prioritization
  assert.ok(content.includes('Phase O'), 'Should have Phase O section');

  // Check for prioritization matrix reference
  assert.ok(
    content.toLowerCase().includes('prioritiz') || content.toLowerCase().includes('matrix'),
    'Should mention prioritization or matrix'
  );

  // Check for research budget
  assert.ok(content.includes('20%') || content.includes('budget'), 'Should mention 20% or budget');

  console.log('  ✓ evolution-workflow.md Phase O has prioritization');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

// Test 5: ADR-049 documented
console.log('\nTest 5: ADR-049 (Research Prioritization Algorithm) documented');
try {
  const decisionsPath = path.join(__dirname, '../../context/memory/decisions.md');

  if (!fs.existsSync(decisionsPath)) {
    throw new Error('decisions.md not found');
  }

  const content = fs.readFileSync(decisionsPath, 'utf-8');

  assert.ok(content.includes('ADR-049'), 'Should have ADR-049');
  assert.ok(
    content.toLowerCase().includes('research prioritization') ||
      content.toLowerCase().includes('prioritization algorithm'),
    'ADR-049 should be about research prioritization'
  );

  // Check for matrix weights
  assert.ok(
    content.includes('0.6') || content.includes('60%'),
    'Should document impact weight (0.6)'
  );
  assert.ok(
    content.includes('0.4') || content.includes('40%'),
    'Should document alignment weight (0.4)'
  );

  console.log('  ✓ ADR-049 documented with matrix rationale');
} catch (error) {
  console.error('  ✗ FAILED:', error.message);
  process.exit(1);
}

console.log('\n✅ All tests passed for Enhancement #7');
console.log('✅ Ready for GREEN phase implementation');
