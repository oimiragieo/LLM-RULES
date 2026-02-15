export function validateProjectArtifacts(context, skillFiles) {
  validateHookFiles(context);
  validateTemplateReferences(context, skillFiles);
  validateCommandFiles(context);
}

function validateHookFiles(context) {
  const { rootDir, warnings, errors, checkDirectory } = context;

  console.log('\nChecking hook files...');
  const hookDir = '.claude/hooks';
  checkDirectory(hookDir, 'hooks directory');

  const settingsPathForHooks = '.claude/settings.json';
  const referencedHookScripts = new Set();
  if (context.exists(context.resolve(rootDir, settingsPathForHooks))) {
    try {
      const settings = JSON.parse(
        context.read(context.resolve(rootDir, settingsPathForHooks), 'utf-8')
      );
      const hookEvents = settings?.hooks || {};
      for (const blocks of Object.values(hookEvents)) {
        if (!Array.isArray(blocks)) {
          continue;
        }

        for (const block of blocks) {
          const hookEntries = Array.isArray(block?.hooks) ? block.hooks : [];
          for (const hook of hookEntries) {
            if (typeof hook?.command !== 'string') {
              continue;
            }

            const match = hook.command.match(/node\s+([^\s]+?\.(?:cjs|mjs|js))/);
            if (match && match[1]) {
              referencedHookScripts.add(match[1].replace(/\\/g, '/'));
            }
          }
        }
      }
    } catch (error) {
      errors.push(`Failed to parse ${settingsPathForHooks} for hook validation: ${error.message}`);
    }
  }

  if (referencedHookScripts.size === 0) {
    warnings.push('No hook scripts found in .claude/settings.json hook commands');
  } else {
    for (const hookPath of [...referencedHookScripts].sort()) {
      if (context.exists(context.resolve(rootDir, hookPath))) {
        console.log(`  ✓ Hook file found: ${hookPath}`);
      } else {
        errors.push(`Hook file referenced in settings.json but missing: ${hookPath}`);
      }
    }
  }

  console.log('  ℹ️  Hooks must return JSON matching SDK HookJSONOutput structure');
  console.log(
    '  ℹ️  Python SDK limitation: SessionStart, SessionEnd, Notification hooks not supported'
  );
}

function validateTemplateReferences(context, skillFiles) {
  const { rootDir, verbose, warnings, errors, checkDirectory } = context;

  console.log('\nValidating template references...');
  const templatesDir = '.claude/templates';
  checkDirectory(templatesDir, 'templates directory');

  const templateReferences = new Set();
  try {
    const agentFiles = context.readdir(context.resolve(rootDir, '.claude/agents'), {
      withFileTypes: true,
    });
    for (const dirent of agentFiles) {
      if (dirent.isFile() && dirent.name.endsWith('.md')) {
        const agentPath = context.resolve(rootDir, '.claude/agents', dirent.name);
        try {
          const content = context.read(agentPath, 'utf-8');
          const templateMatches = content.match(/\.claude\/templates\/[a-z0-9-]+\.md/g);
          if (templateMatches) {
            templateMatches.forEach(templateRef => {
              templateReferences.add(templateRef);
            });
          }
        } catch (_error) {
          // Skip if can't read
        }
      }
    }
  } catch (error) {
    warnings.push(`Error scanning agent files for template references: ${error.message}`);
  }

  for (const { path: skillPath, _name } of skillFiles) {
    try {
      const content = context.read(skillPath, 'utf-8');
      const templateMatches = content.match(/\.claude\/templates\/[a-z0-9-]+\.md/g);
      if (templateMatches) {
        templateMatches.forEach(templateRef => {
          templateReferences.add(templateRef);
        });
      }
    } catch (_error) {
      // Skip if can't read
    }
  }

  for (const templateRef of templateReferences) {
    const templatePath = context.resolve(rootDir, templateRef);
    if (!context.exists(templatePath)) {
      errors.push(`Template file referenced but missing: ${templateRef}`);
    } else if (verbose) {
      console.log(`  ✓ Template reference validated: ${templateRef}`);
    }
  }

  if (templateReferences.size === 0 && verbose) {
    console.log('  ℹ️  No template references found in agent or skill files');
  }
}

function validateCommandFiles(context) {
  const { rootDir, warnings, errors, checkDirectory } = context;

  console.log('\nValidating command files...');
  const commandsDir = '.claude/commands';
  if (checkDirectory(commandsDir, 'commands directory')) {
    try {
      const commandFiles = context
        .readdir(context.resolve(rootDir, commandsDir), { withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'))
        .map(dirent => dirent.name);

      if (commandFiles.length === 0) {
        warnings.push('No command files found in .claude/commands');
      } else {
        for (const fileName of commandFiles) {
          const commandPath = context.resolve(rootDir, commandsDir, fileName);
          const content = context.read(commandPath, 'utf-8').trim();
          if (content.length === 0) {
            errors.push(`Command file is empty: ${commandsDir}/${fileName}`);
          }
        }
        console.log(`  ✓ Command files validated: ${commandFiles.length}`);
      }
    } catch (error) {
      errors.push(`Error reading commands directory: ${error.message}`);
    }
  }
}
