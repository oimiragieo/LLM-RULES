'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadDoctorModule() {
  const doctorPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'tools',
    'cli',
    'doctor.mjs'
  );
  return import(pathToFileURL(doctorPath).href);
}

test('detects unpinned @modelcontextprotocol package args', async () => {
  const doctor = await loadDoctorModule();
  assert.equal(
    doctor.hasUnpinnedMcpPackageArg(['-y', '@modelcontextprotocol/server-filesystem']),
    true
  );
});

test('does not flag pinned @modelcontextprotocol package args', async () => {
  const doctor = await loadDoctorModule();
  assert.equal(
    doctor.hasUnpinnedMcpPackageArg(['-y', '@modelcontextprotocol/server-filesystem@1.2.3']),
    false
  );
});

test('does not flag unrelated args', async () => {
  const doctor = await loadDoctorModule();
  assert.equal(doctor.hasUnpinnedMcpPackageArg(['node', 'server.js']), false);
});
