'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const READINESS_REPORT_SCHEMA = {
  type: 'object',
  required: ['repoPath', 'timestamp', 'level', 'overallScore', 'pillars', 'gateStatus'],
  properties: {
    repoPath: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    level: { type: 'string', enum: ['L1', 'L2', 'L3', 'L4', 'L5'] },
    overallScore: { type: 'number', minimum: 0, maximum: 100 },
    pillars: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['score', 'passed', 'weight', 'command', 'exitCode'],
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          passed: { type: 'boolean' },
          weight: { type: 'number' },
          command: { type: 'string' },
          exitCode: { type: 'number', nullable: true },
          reason: { type: 'string', nullable: true },
        },
        additionalProperties: false,
      },
    },
    gateStatus: {
      type: 'object',
      required: ['passed', 'threshold'],
      properties: {
        passed: { type: 'boolean' },
        threshold: { type: 'number' },
        details: { type: 'string' },
      },
      additionalProperties: true,
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: true,
};

function createAjv() {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  return ajv;
}

const validateReport = createAjv().compile(READINESS_REPORT_SCHEMA);

module.exports = {
  READINESS_REPORT_SCHEMA,
  createAjv,
  validateReport,
};
