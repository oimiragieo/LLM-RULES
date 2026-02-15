'use strict';

function buildTemplates(toTitleCase) {
  return {
    input: skillName => ({
      $schema: 'https://json-schema.org/draft-07/schema#',
      $id: `https://claude.ai/schemas/${skillName}-input`,
      title: `${toTitleCase(skillName)} Input Schema`,
      description: `Input validation schema for ${skillName} skill`,
      type: 'object',
      required: [],
      properties: {},
      additionalProperties: true,
    }),

    output: skillName => ({
      $schema: 'https://json-schema.org/draft-07/schema#',
      $id: `https://claude.ai/schemas/${skillName}-output`,
      title: `${toTitleCase(skillName)} Output Schema`,
      description: `Output validation schema for ${skillName} skill`,
      type: 'object',
      required: ['success'],
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the skill executed successfully',
        },
        result: {
          type: 'object',
          description: 'The skill execution result',
          additionalProperties: true,
        },
        error: {
          type: 'string',
          description: 'Error message if execution failed',
        },
      },
      additionalProperties: true,
    }),

    global: name => ({
      $schema: 'https://json-schema.org/draft-07/schema#',
      $id: `https://claude.ai/schemas/${name}`,
      title: `${toTitleCase(name)} Schema`,
      description: `Schema for validating ${name} data structures`,
      type: 'object',
      required: [],
      properties: {},
      additionalProperties: false,
      examples: [],
    }),

    definition: {
      agent: () => ({
        $schema: 'https://json-schema.org/draft-07/schema#',
        $id: 'https://claude.ai/schemas/agent-definition',
        title: 'Agent Definition Schema',
        description: 'Schema for validating Claude Code agent definition files',
        type: 'object',
        required: ['frontmatter', 'content'],
        properties: {
          frontmatter: {
            type: 'object',
            required: ['name', 'description'],
            properties: {
              name: {
                type: 'string',
                pattern: '^[a-z][a-z0-9-]*$',
                description: 'Agent name in lowercase-with-hyphens format',
              },
              description: {
                type: 'string',
                minLength: 20,
                maxLength: 500,
                description: 'Description of what the agent does and WHEN to use it',
              },
              tools: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tools available to the agent',
              },
              model: {
                type: 'string',
                enum: ['sonnet', 'opus', 'haiku', 'inherit'],
                description: 'Model to use for the agent',
              },
              temperature: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Temperature for model responses',
              },
              skills: {
                type: 'array',
                items: { type: 'string' },
                description: 'Skills to preload for the agent',
              },
            },
          },
          content: {
            type: 'string',
            minLength: 100,
            description: 'Markdown content with agent instructions',
          },
        },
      }),

      skill: () => ({
        $schema: 'https://json-schema.org/draft-07/schema#',
        $id: 'https://claude.ai/schemas/skill-definition',
        title: 'Skill Definition Schema',
        description: 'Schema for validating Claude Code skill definitions',
        type: 'object',
        required: ['name', 'description'],
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-z][a-z0-9-]*$',
            description: 'Skill name in lowercase-with-hyphens format',
          },
          description: {
            type: 'string',
            minLength: 20,
            description: 'Clear description of what the skill does',
          },
          version: {
            type: 'string',
            pattern: '^\\d+\\.\\d+(\\.\\d+)?$',
            default: '1.0.0',
            description: 'Semantic version number',
          },
          model: {
            type: 'string',
            enum: ['sonnet', 'opus', 'haiku', 'inherit'],
            description: 'Preferred model for this skill',
          },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tools this skill uses',
          },
        },
        additionalProperties: true,
      }),

      hook: () => ({
        $schema: 'https://json-schema.org/draft-07/schema#',
        $id: 'https://claude.ai/schemas/hook-definition',
        title: 'Hook Definition Schema',
        description: 'Schema for validating Claude Code hook definitions',
        type: 'object',
        required: ['name', 'type', 'purpose'],
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-z][a-z0-9-]*$',
            description: 'Hook name in lowercase-with-hyphens format',
          },
          type: {
            type: 'string',
            enum: ['PreToolUse', 'PostToolUse', 'UserPromptSubmit'],
            description: 'Hook trigger type',
          },
          purpose: {
            type: 'string',
            minLength: 10,
            maxLength: 500,
            description: 'Description of what the hook does',
          },
          matcher: {
            type: 'string',
            description: 'Regex pattern for matching tool names',
          },
        },
      }),

      workflow: () => ({
        $schema: 'https://json-schema.org/draft-07/schema#',
        $id: 'https://claude.ai/schemas/workflow-definition',
        title: 'Workflow Definition Schema',
        description: 'Schema for validating Claude Code workflow definitions',
        type: 'object',
        required: ['name', 'steps'],
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-z][a-z0-9-]*$',
            description: 'Workflow name in lowercase-with-hyphens format',
          },
          description: {
            type: 'string',
            maxLength: 500,
            description: 'Description of what the workflow does',
          },
          steps: {
            type: 'array',
            minItems: 1,
            description: 'Workflow steps',
          },
        },
      }),

      custom: name => ({
        $schema: 'https://json-schema.org/draft-07/schema#',
        $id: `https://claude.ai/schemas/${name}-definition`,
        title: `${toTitleCase(name)} Definition Schema`,
        description: `Schema for validating ${name} definitions`,
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            pattern: '^[a-z][a-z0-9-]*$',
            description: `${toTitleCase(name)} name in lowercase-with-hyphens format`,
          },
        },
        additionalProperties: true,
      }),
    },
  };
}

module.exports = {
  buildTemplates,
};
