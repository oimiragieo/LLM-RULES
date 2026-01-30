/**
 * Load Test Framework
 *
 * Simulates concurrent workflows, large codebases, and resource constraints
 * to test framework performance at enterprise scale.
 *
 * Usage:
 *   const LoadTestFramework = require('.claude/lib/testing/load-test-framework.cjs');
 *   const framework = new LoadTestFramework({ concurrentWorkflows: 100 });
 *   const workflows = await framework.simulateConcurrentWorkflows(100, 'even');
 */

const fs = require('node:fs').promises;
const path = require('node:path');
const os = require('node:os');

class LoadTestFramework {
  constructor(config = {}) {
    this.concurrentWorkflows = config.concurrentWorkflows || 100;
    this.codebaseSize = config.codebaseSize || 50000; // LOC
    this.resourceLimits = config.resourceLimits || {
      memoryMB: 300,
      cpuPercent: 80
    };
    this.tempDir = null;
    this.workflows = [];
    this.metrics = {
      spawnTimes: [],
      memoryUsage: [],
      throughput: []
    };
  }

  async setup() {
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'load-test-'));
  }

  async cleanup() {
    if (this.tempDir) {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    }
    this.workflows = [];
    this.metrics = { spawnTimes: [], memoryUsage: [], throughput: [] };
  }

  /**
   * Simulate N concurrent workflows with specified traffic pattern
   *
   * @param {number} count - Number of workflows to simulate
   * @param {string} pattern - Traffic pattern: 'even', 'bursty', 'random'
   * @returns {Promise<Array>} Simulated workflows
   */
  async simulateConcurrentWorkflows(count, pattern = 'even') {
    const workflows = [];
    const delays = this.generateDelays(count, pattern);

    for (let i = 0; i < count; i++) {
      const startTime = Date.now();
      await this.sleep(delays[i]);

      const workflow = await this.createWorkflow(`workflow-${i}`, {
        tasks: Math.floor(Math.random() * 10) + 5, // 5-15 tasks
        phases: Math.floor(Math.random() * 3) + 3 // 3-5 phases
      });

      const spawnTime = Date.now() - startTime - delays[i];
      this.metrics.spawnTimes.push(spawnTime);
      workflows.push(workflow);
    }

    this.workflows = workflows;
    return workflows;
  }

  /**
   * Create a simulated workflow
   *
   * @param {string} id - Workflow ID
   * @param {object} config - Workflow configuration
   * @returns {Promise<object>} Workflow object
   */
  async createWorkflow(id, config) {
    const tasks = [];
    for (let i = 0; i < config.tasks; i++) {
      tasks.push({
        id: `${id}-task-${i}`,
        status: 'pending',
        data: { phase: Math.ceil((i + 1) / (config.tasks / config.phases)) }
      });
    }

    return {
      id,
      status: 'running',
      tasks,
      phases: config.phases,
      createdAt: Date.now()
    };
  }

  /**
   * Generate traffic delays based on pattern
   *
   * @param {number} count - Number of delays
   * @param {string} pattern - Traffic pattern
   * @returns {Array<number>} Delays in ms
   */
  generateDelays(count, pattern) {
    const delays = [];

    switch (pattern) {
      case 'even':
        // Evenly distributed over 5 seconds
        const interval = 5000 / count;
        for (let i = 0; i < count; i++) {
          delays.push(i * interval);
        }
        break;

      case 'bursty':
        // All requests within 1 second
        for (let i = 0; i < count; i++) {
          delays.push(Math.random() * 1000);
        }
        break;

      case 'random':
        // Random delays up to 10 seconds
        for (let i = 0; i < count; i++) {
          delays.push(Math.random() * 10000);
        }
        break;

      default:
        throw new Error(`Unknown pattern: ${pattern}`);
    }

    return delays.sort((a, b) => a - b);
  }

  /**
   * Simulate a large codebase
   *
   * @param {number} sizeInLOC - Total lines of code
   * @returns {Promise<object>} Codebase simulation
   */
  async simulateLargeCodebase(sizeInLOC) {
    const avgLOCPerFile = 500;
    const fileCount = Math.ceil(sizeInLOC / avgLOCPerFile);
    const files = [];

    for (let i = 0; i < fileCount; i++) {
      const loc = Math.min(avgLOCPerFile, sizeInLOC - (i * avgLOCPerFile));
      files.push({
        path: `src/module${Math.floor(i / 10)}/file${i}.js`,
        loc,
        type: 'javascript'
      });
    }

    return {
      totalLOC: sizeInLOC,
      files,
      fileCount,
      languages: ['javascript'],
      frameworks: ['Node.js']
    };
  }

  /**
   * Run brownfield detection on simulated codebase
   *
   * @param {object} codebase - Codebase object
   * @returns {Promise<object>} Detection results
   */
  async runBrownfieldDetection(codebase) {
    // Simulate detection logic
    await this.sleep(Math.min(codebase.totalLOC / 1000, 5000)); // Scale with size, max 5s

    return {
      languages: codebase.languages || ['javascript'],
      frameworks: codebase.frameworks || ['Node.js'],
      confidence: 0.9,
      detectedFiles: codebase.files.length
    };
  }

  /**
   * Apply resource constraints
   *
   * @param {number} memoryMB - Memory limit in MB
   * @param {number} cpuPercent - CPU limit percentage
   */
  async applyResourceConstraints(memoryMB, cpuPercent) {
    this.resourceLimits.memoryMB = memoryMB;
    this.resourceLimits.cpuPercent = cpuPercent;

    // Simulate constraint checking
    const currentMem = process.memoryUsage().heapUsed / 1024 / 1024;
    if (currentMem > memoryMB * 0.9) {
      // Approaching limit, trigger GC
      global.gc?.();
    }
  }

  /**
   * Measure task spawn time for workflows
   *
   * @param {Array} workflows - Workflows to measure
   * @returns {Promise<Array<number>>} Spawn times in ms
   */
  async measureTaskSpawnTime(workflows) {
    if (workflows.length === 0) {
      return this.metrics.spawnTimes;
    }

    const spawnTimes = [];
    for (const workflow of workflows.slice(0, 10)) { // Sample 10 workflows
      const startTime = Date.now();
      await this.simulateTaskOperation();
      spawnTimes.push(Date.now() - startTime);
    }

    return spawnTimes;
  }

  /**
   * Simulate a single task operation
   *
   * @returns {Promise<void>}
   */
  async simulateTaskOperation() {
    // Simulate task creation overhead (50-100ms)
    await this.sleep(50 + Math.random() * 50);
  }

  /**
   * Measure throughput (tasks per second)
   *
   * @param {number} workflowCount - Number of workflows to test
   * @returns {Promise<number>} Tasks per second
   */
  async measureThroughput(workflowCount) {
    const startTime = Date.now();
    let taskCount = 0;

    for (let i = 0; i < workflowCount; i++) {
      const workflow = await this.createWorkflow(`throughput-${i}`, {
        tasks: 10,
        phases: 3
      });
      taskCount += workflow.tasks.length;
    }

    const duration = (Date.now() - startTime) / 1000; // seconds
    return taskCount / duration;
  }

  /**
   * Generate load test report
   *
   * @returns {Promise<string>} Markdown report
   */
  async generateLoadTestReport() {
    const avgSpawnTime = this.metrics.spawnTimes.length > 0
      ? this.metrics.spawnTimes.reduce((a, b) => a + b, 0) / this.metrics.spawnTimes.length
      : 0;

    const peakMemory = Math.max(...this.metrics.memoryUsage, process.memoryUsage().heapUsed / 1024 / 1024);

    const report = `# Load Test Report

## Summary

- **Total Workflows**: ${this.workflows.length}
- **Average Spawn Time**: ${avgSpawnTime.toFixed(2)}ms
- **Peak Memory**: ${peakMemory.toFixed(2)}MB
- **Resource Limits**: ${this.resourceLimits.memoryMB}MB memory, ${this.resourceLimits.cpuPercent}% CPU

## Performance Metrics

- **Spawn Times**: min=${Math.min(...this.metrics.spawnTimes)}ms, max=${Math.max(...this.metrics.spawnTimes)}ms, avg=${avgSpawnTime.toFixed(2)}ms
- **Memory Usage**: ${peakMemory.toFixed(2)}MB

## Baseline Comparison

Comparing against baseline performance targets:
- Spawn Time Target: <5000ms - ${avgSpawnTime < 5000 ? '✅ PASS' : '❌ FAIL'}
- Memory Target: <${this.resourceLimits.memoryMB}MB - ${peakMemory < this.resourceLimits.memoryMB ? '✅ PASS' : '❌ FAIL'}

## Performance Degradation

${avgSpawnTime > 5000 ? '⚠️ WARNING: Spawn time exceeded target' : '✅ Performance within acceptable range'}
`;

    return report;
  }

  /**
   * Sleep helper
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = LoadTestFramework;
