/**
 * Profiling Report Generator
 *
 * Generates comprehensive markdown reports from performance metrics,
 * bottleneck analysis, and optimization targets.
 */

/**
 * Generate profiling report in markdown format
 * @param {Object} metrics - Performance metrics
 * @param {Array} bottlenecks - Identified bottlenecks
 * @param {Object} targets - Performance targets by tier
 * @param {Object} baseline - Optional baseline metrics for comparison
 * @returns {string} Markdown report
 */
function generateProfilingReport(metrics, bottlenecks, targets, baseline = null) {
  const sections = [];

  // 1. Executive Summary
  sections.push('# Performance Profiling Report');
  sections.push('');
  sections.push(`Generated: ${new Date().toISOString()}`);
  sections.push('');
  sections.push('## Executive Summary');
  sections.push('');

  if (bottlenecks.length > 0) {
    sections.push('### Top Bottlenecks');
    sections.push('');
    bottlenecks.slice(0, 5).forEach((bottleneck, index) => {
      sections.push(
        `${index + 1}. **${bottleneck.name}** - ${bottleneck.executionTime.toFixed(2)}ms (${bottleneck.percentage}% of total)`
      );
    });
    sections.push('');
  }

  // Recommendations
  sections.push('### Recommendations');
  sections.push('');
  if (bottlenecks.length > 0) {
    const topBottleneck = bottlenecks[0];
    if (topBottleneck.suggestions && topBottleneck.suggestions.length > 0) {
      topBottleneck.suggestions.forEach(suggestion => {
        sections.push(`- ${suggestion}`);
      });
    } else {
      sections.push(
        `- Optimize ${topBottleneck.name} (${topBottleneck.percentage}% of total time)`
      );
    }
  }
  sections.push('');

  // 2. Per-SPEC Performance Breakdown
  if (Object.keys(metrics).length > 0) {
    sections.push('## Per-Component Breakdown');
    sections.push('');
    sections.push('| Component | Execution Time | Memory Used | Call Count |');
    sections.push('|-----------|----------------|-------------|------------|');

    const entries = Object.entries(metrics);
    entries.forEach(([name, data]) => {
      const execTime = (data.executionTime || 0).toFixed(2);
      const memory = data.memoryUsed ? `${(data.memoryUsed / 1024 / 1024).toFixed(2)} MB` : 'N/A';
      const callCount = data.callCount || 1;
      sections.push(`| ${name} | ${execTime}ms | ${memory} | ${callCount} |`);
    });
    sections.push('');
  }

  // 3. Bottleneck Analysis
  if (bottlenecks.length > 0) {
    sections.push('## Bottleneck Analysis');
    sections.push('');

    bottlenecks.forEach(bottleneck => {
      sections.push(`### ${bottleneck.name}`);
      sections.push('');
      sections.push(`- **Execution Time**: ${bottleneck.executionTime.toFixed(2)}ms`);
      sections.push(`- **Percentage of Total**: ${bottleneck.percentage}%`);
      if (bottleneck.callCount) {
        sections.push(`- **Call Count**: ${bottleneck.callCount}`);
      }
      if (bottleneck.memoryUsed) {
        sections.push(`- **Memory Used**: ${(bottleneck.memoryUsed / 1024 / 1024).toFixed(2)} MB`);
      }
      sections.push('');

      if (bottleneck.suggestions && bottleneck.suggestions.length > 0) {
        sections.push('**Optimization Strategies:**');
        sections.push('');
        bottleneck.suggestions.forEach(suggestion => {
          sections.push(`- ${suggestion}`);
        });
        sections.push('');
      }
    });
  }

  // 4. Tier-Based Recommendations
  sections.push('## Tier-Based Recommendations');
  sections.push('');

  if (targets.tier1 && targets.tier1.length > 0) {
    sections.push('### Tier 1: Critical Path (Highest Priority)');
    sections.push('');
    targets.tier1.forEach(target => {
      sections.push(`- **${target.component}**: Target ${target.targetTime}${target.unit}`);
      sections.push(`  - ${target.rationale}`);
    });
    sections.push('');
  }

  if (targets.tier2 && targets.tier2.length > 0) {
    sections.push('### Tier 2: Important (Medium Priority)');
    sections.push('');
    targets.tier2.forEach(target => {
      sections.push(`- **${target.component}**: Target ${target.targetTime}${target.unit}`);
      if (target.rationale) {
        sections.push(`  - ${target.rationale}`);
      }
    });
    sections.push('');
  }

  if (targets.tier3 && targets.tier3.length > 0) {
    sections.push('### Tier 3: Nice-to-Have (Low Priority)');
    sections.push('');
    targets.tier3.forEach(target => {
      sections.push(`- **${target.component}**: Target ${target.targetTime}${target.unit}`);
      if (target.rationale) {
        sections.push(`  - ${target.rationale}`);
      }
    });
    sections.push('');
  }

  // 5. Historical Comparison (if baseline available)
  if (baseline) {
    sections.push('## Historical Comparison');
    sections.push('');
    sections.push('Comparing current metrics against baseline:');
    sections.push('');

    const improvements = [];
    const regressions = [];

    for (const [name, current] of Object.entries(metrics)) {
      if (baseline[name]) {
        const baseTime = baseline[name].executionTime;
        const currentTime = current.executionTime;
        const diff = currentTime - baseTime;
        const percentChange = ((diff / baseTime) * 100).toFixed(1);

        if (diff < 0) {
          improvements.push(`- ${name}: ${Math.abs(percentChange)}% faster`);
        } else if (diff > 0) {
          regressions.push(`- ${name}: ${percentChange}% slower`);
        }
      }
    }

    if (improvements.length > 0) {
      sections.push('**Improvements:**');
      sections.push('');
      improvements.forEach(item => sections.push(item));
      sections.push('');
    }

    if (regressions.length > 0) {
      sections.push('**Regressions:**');
      sections.push('');
      regressions.forEach(item => sections.push(item));
      sections.push('');
    }
  }

  // 6. Estimated Savings
  sections.push('## Estimated Savings');
  sections.push('');

  if (bottlenecks.length > 0) {
    bottlenecks.forEach(bottleneck => {
      if (bottleneck.targetTime !== undefined) {
        const savings = bottleneck.executionTime - bottleneck.targetTime;
        const callCount = bottleneck.callCount || 1;
        const totalSavings = savings * callCount;

        if (savings > 0) {
          sections.push(
            `- **${bottleneck.name}**: ${savings.toFixed(2)}ms per call × ${callCount} calls = ${totalSavings.toFixed(2)}ms total (${bottleneck.percentage}% improvement)`
          );
        }
      }

      if (bottleneck.targetMemory !== undefined && bottleneck.memoryUsed) {
        const memorySavings = bottleneck.memoryUsed - bottleneck.targetMemory;
        if (memorySavings > 0) {
          sections.push(
            `- **${bottleneck.name}**: ${(memorySavings / 1024 / 1024).toFixed(2)} MB memory reduction`
          );
        }
      }
    });
    sections.push('');
  }

  return sections.join('\n');
}

module.exports = { generateProfilingReport };
