try {
  const { ArchitectAgent } = require('./.claude/lib/agents/architect/index.cjs');
  console.log('Successfully required ArchitectAgent:', !!ArchitectAgent);
  const agent = new ArchitectAgent();
  console.log('Successfully instantiated ArchitectAgent:', agent.name);
} catch (error) {
  console.error('Failed to load ArchitectAgent:', error);
}
