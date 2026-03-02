export function validateWorkflowAndAgentReferences(context, config) {
  const { yaml, warnings, errors, checkFile, validateYAML, collectFilesRecursive } = context;

  console.log('\nValidating workflow files...');
  const workflowFiles = collectFilesRecursive(
    '.claude/workflows',
    fullPath => fullPath.endsWith('.yaml') || fullPath.endsWith('.yml')
  );
  if (workflowFiles.length === 0) {
    warnings.push('No workflow files found under .claude/workflows/');
  }

  const referencedSchemas = new Set();
  for (const workflowFile of workflowFiles) {
    if (!context.exists(resolvePath(context, workflowFile))) {
      warnings.push(`Workflow file not found: ${workflowFile}`);
      continue;
    }

    validateYAML(workflowFile, `workflow file ${workflowFile}`);

    if (yaml) {
      try {
        const workflowContent = context.read(resolvePath(context, workflowFile), 'utf-8');
        const workflow = yaml.load(workflowContent);
        if (workflow.steps && Array.isArray(workflow.steps)) {
          for (const step of workflow.steps) {
            if (step.validation && step.validation.schema) {
              referencedSchemas.add(step.validation.schema);
            }
          }
        }
      } catch (_error) {
        // Already reported as YAML error
      }
    } else {
      try {
        const workflowContent = context.read(resolvePath(context, workflowFile), 'utf-8');
        const schemaMatches = workflowContent.match(/schema:\s*([^\s]+)/g);
        if (schemaMatches) {
          schemaMatches.forEach(match => {
            const schemaPath = match.replace(/schema:\s*/, '').trim();
            referencedSchemas.add(schemaPath);
          });
        }
      } catch (_error) {
        // Skip if can't read
      }
    }
  }

  console.log('\nChecking referenced schema files...');
  for (const schemaPath of referencedSchemas) {
    if (!checkFile(schemaPath, `schema file ${schemaPath}`)) {
      errors.push(`Schema file referenced in workflow but missing: ${schemaPath}`);
    }
  }

  console.log('\nChecking agents in workflows...');
  const referencedAgents = new Set();
  for (const workflowFile of workflowFiles) {
    if (!context.exists(resolvePath(context, workflowFile))) {
      continue;
    }

    if (yaml) {
      try {
        const workflowContent = context.read(resolvePath(context, workflowFile), 'utf-8');
        const workflow = yaml.load(workflowContent);
        collectAgentsFromWorkflow(workflow, workflowFile, referencedAgents);
      } catch (_error) {
        // Already reported as YAML error
      }
    }
  }

  const configAgents = config?.agents || {};
  for (const { agent, workflow } of referencedAgents) {
    if (configAgents[agent] && configAgents[agent].path) {
      const agentPath = configAgents[agent].path;
      if (!checkFile(agentPath, `agent ${agent} referenced in ${workflow}`)) {
        errors.push(`Missing agent ${agent} referenced in ${workflow}: ${agentPath}`);
      }
    } else {
      const agentFile = `.claude/agents/${agent}.md`;
      if (!checkFile(agentFile, `agent ${agent} referenced in ${workflow}`)) {
        errors.push(`Agent ${agent} referenced in ${workflow} but file missing`);
      }
    }
  }
}

function collectAgentsFromWorkflow(workflow, workflowFile, referencedAgents) {
  if (workflow.steps && Array.isArray(workflow.steps)) {
    for (const step of workflow.steps) {
      if (step.agent) {
        referencedAgents.add({ agent: step.agent, workflow: workflowFile });
      }
    }
  }

  if (workflow.phases && Array.isArray(workflow.phases)) {
    for (const phase of workflow.phases) {
      collectAgentsFromPhase(phase, workflowFile, referencedAgents);
    }
  }
}

function collectAgentsFromPhase(phase, workflowFile, referencedAgents) {
  if (phase.steps && Array.isArray(phase.steps)) {
    for (const step of phase.steps) {
      if (step.agent) {
        referencedAgents.add({ agent: step.agent, workflow: workflowFile });
      }
    }
  }

  if (phase.decision) {
    collectConditionalAgents(phase.decision.if_yes, workflowFile, referencedAgents);
    collectConditionalAgents(phase.decision.if_no, workflowFile, referencedAgents);
  }

  if (phase.epic_loop && phase.epic_loop.story_loop && Array.isArray(phase.epic_loop.story_loop)) {
    for (const step of phase.epic_loop.story_loop) {
      if (step.agent) {
        referencedAgents.add({ agent: step.agent, workflow: workflowFile });
      }
    }
  }
}

function collectConditionalAgents(steps, workflowFile, referencedAgents) {
  if (!Array.isArray(steps)) {
    return;
  }

  for (const step of steps) {
    if (step.agent) {
      referencedAgents.add({ agent: step.agent, workflow: workflowFile });
    }
  }
}

function resolvePath(context, relativePath) {
  return context.resolve(context.rootDir, relativePath);
}
