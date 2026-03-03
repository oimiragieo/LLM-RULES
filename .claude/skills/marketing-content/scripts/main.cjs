'use strict';

/**
 * main.cjs — marketing-content skill CLI entry point
 *
 * Usage:
 *   node .claude/skills/marketing-content/scripts/main.cjs --action write-copy --platform email --topic "product launch"
 *   node .claude/skills/marketing-content/scripts/main.cjs --action plan-campaign --goal leads --duration_days 30
 *   node .claude/skills/marketing-content/scripts/main.cjs --action build-calendar --duration_days 90
 */

const path = require('path');

const VALID_ACTIONS = [
  'write-copy',
  'plan-campaign',
  'build-calendar',
  'design-ab-test',
  'analyze-performance',
  'create-brief',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = val;
      if (val !== true) i++;
    }
  }
  return args;
}

function validate(args) {
  if (!args.action) {
    console.error('[marketing-content] Error: --action is required');
    console.error(`Valid actions: ${VALID_ACTIONS.join(', ')}`);
    process.exit(1);
  }
  if (!VALID_ACTIONS.includes(args.action)) {
    console.error(`[marketing-content] Error: Invalid action "${args.action}"`);
    console.error(`Valid actions: ${VALID_ACTIONS.join(', ')}`);
    process.exit(1);
  }
}

function run(args) {
  validate(args);

  const result = {
    action: args.action,
    success: true,
    input: args,
    guidance: getGuidance(args.action, args),
    timestamp: new Date().toISOString(),
  };

  console.log(JSON.stringify(result, null, 2));
}

function getGuidance(action, args) {
  switch (action) {
    case 'write-copy':
      return {
        instruction: 'Apply the appropriate copywriting framework based on audience_stage',
        recommended_framework: recommendFramework(args.audience_stage),
        platform_guidelines: args.platform
          ? `See SKILL.md Platform-Specific Content section for ${args.platform}`
          : 'Specify --platform for tailored guidelines',
        next_step: 'Use SKILL.md Copywriting Patterns section for framework template',
      };

    case 'plan-campaign':
      return {
        instruction: 'Follow the Campaign Planning structure in SKILL.md',
        structure: [
          'OBJECTIVE',
          'AUDIENCE',
          'BUDGET',
          'CHANNELS',
          'TIMELINE',
          'KPIs',
          'CONTENT_MAP',
        ],
        duration: args.duration_days ? `${args.duration_days} days` : 'Not specified',
        next_step: 'Build a content map by channel and funnel stage',
      };

    case 'build-calendar':
      return {
        instruction: 'Use Editorial Calendar Management section in SKILL.md',
        workflow_states: [
          'IDEATION',
          'IN_PROGRESS',
          'REVIEW',
          'SCHEDULED',
          'PUBLISHED',
          'MEASURING',
        ],
        duration: args.duration_days ? `${args.duration_days} days` : 'Not specified',
        next_step: 'Create content briefs for each planned piece',
      };

    case 'design-ab-test':
      return {
        instruction: 'Follow A/B Testing Workflow in SKILL.md',
        test_priority: 'Email subject line → Ad headline → CTA text → Landing page hero',
        minimum_sample: '500 impressions per variant',
        minimum_duration: '7 days',
        next_step: 'Define hypothesis and single variable to test',
      };

    case 'analyze-performance':
      return {
        instruction: 'Use Content Performance KPIs section in SKILL.md',
        kpi_tiers: ['Tier 1: Engagement', 'Tier 2: Conversion', 'Tier 3: Retention', 'Tier 4: ROI'],
        primary_metric: args.kpi || 'Define primary KPI first',
        next_step: 'Map current metrics to KPI tier and identify gaps',
      };

    case 'create-brief':
      return {
        instruction: 'Use Content Brief Template in SKILL.md Editorial Calendar section',
        required_fields: [
          'title',
          'content_type',
          'platform',
          'framework',
          'audience',
          'goal',
          'kpi',
          'cta',
        ],
        next_step: 'Fill in all required fields before assigning to writer',
      };

    default:
      return { instruction: 'Unknown action' };
  }
}

function recommendFramework(audienceStage) {
  const map = {
    unaware: 'AIDA or PAS',
    'problem-aware': 'PAS or BAB',
    'solution-aware': '4Ps or FAB',
    'product-aware': 'FAB or BAB',
    'most-aware': 'Direct CTA (no framework needed)',
  };
  return map[audienceStage] || 'Specify --audience_stage for recommendation (AIDA/PAS/BAB/4Ps/FAB)';
}

// Run if called directly
if (require.main === module) {
  const args = parseArgs(process.argv);
  run(args);
}

module.exports = { run, validate, recommendFramework };
