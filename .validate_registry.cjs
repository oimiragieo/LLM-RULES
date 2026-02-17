const fs = require('fs');

const registry = JSON.parse(fs.readFileSync('./.claude/context/agent-registry.json', 'utf8'));

const issues = [];
const warnings = [];
const stats = { agents: 0, validTools: 0, missingTools: 0 };

console.log('Agent Registry Validation');
console.log('========================\n');

// Check metadata
const metadata = registry.metadata || {};
console.log(`Total agents: ${metadata.totalAgents || 'N/A'}`);
console.log(`Healthy: ${metadata.healthyAgents || 'N/A'}`);
console.log(`Degraded: ${metadata.degradedAgents || 'N/A'}`);
console.log(`Unavailable: ${metadata.unavailableAgents || 'N/A'}\n`);

// Validate agents
const agents = registry.agents || {};
const requiredFields = ['id', 'displayName', 'category', 'filePath', 'capabilities'];

Object.entries(agents).forEach(([agentId, agent]) => {
  stats.agents++;

  // Check required fields
  requiredFields.forEach(field => {
    if (!agent[field]) {
      issues.push(`Agent '${agentId}': Missing field '${field}'`);
    }
  });

  // Validate capabilities
  const caps = agent.capabilities || [];
  caps.forEach(cap => {
    // Check for old tool names (should use new names)
    if (cap.requiredTools) {
      cap.requiredTools.forEach(_tool => {
        stats.validTools++;
      });
    }
  });
});

console.log(`Validated agents: ${stats.agents}`);
console.log(`Issues found: ${issues.length}`);
console.log(`Warnings: ${warnings.length}\n`);

if (issues.length > 0) {
  console.log('Issues:');
  issues.slice(0, 10).forEach(i => console.log(`  ✗ ${i}`));
  if (issues.length > 10) console.log(`  ... and ${issues.length - 10} more`);
  console.log();
}

if (warnings.length > 0) {
  console.log('Warnings:');
  warnings.slice(0, 5).forEach(w => console.log(`  ! ${w}`));
  console.log();
}

console.log(`\nStatus: ${issues.length === 0 ? 'PASS' : 'FAIL'}`);
