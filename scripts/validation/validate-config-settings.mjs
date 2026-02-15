export function validateMcpAndSettings(context) {
  const { rootDir, warnings, errors } = context;

  console.log('\nValidating MCP configuration...');
  const mcpConfigPath = '.claude/.mcp.json';
  let mcpToolSearchEnabled = false;

  if (context.exists(context.resolve(rootDir, mcpConfigPath))) {
    try {
      const mcpContent = context.read(context.resolve(rootDir, mcpConfigPath), 'utf-8');
      const mcpConfig = JSON.parse(mcpContent);
      mcpToolSearchEnabled = Boolean(mcpConfig?.toolSearch?.enabled);

      if (typeof mcpConfig !== 'object' || mcpConfig === null) {
        errors.push('.mcp.json: Root must be an object');
      } else {
        const allowedTopLevelKeys = ['betaFeatures', 'toolSearch', 'mcpServers', 'disabledMcpServers'];
        const unknownKeys = Object.keys(mcpConfig).filter(key => !allowedTopLevelKeys.includes(key));
        if (unknownKeys.length > 0) {
          warnings.push(`.mcp.json: Unknown top-level keys: ${unknownKeys.join(', ')}`);
        }

        if (mcpConfig.betaFeatures !== undefined && !Array.isArray(mcpConfig.betaFeatures)) {
          errors.push('.mcp.json: betaFeatures must be an array');
        }

        if (mcpConfig.toolSearch !== undefined) {
          validateToolSearchBlock(mcpConfig, errors);
        }

        if (mcpConfig.mcpServers !== undefined) {
          validateMcpServersBlock(mcpConfig, warnings, errors);
        }
      }

      console.log('  ✓ .mcp.json validated');
    } catch (error) {
      errors.push(`Invalid JSON in .mcp.json: ${error.message}`);
    }
  } else {
    console.log('  ℹ️  .mcp.json not found (optional)');
  }

  console.log('\nValidating SDK settings files...');
  validateProjectSettings(context, mcpToolSearchEnabled);
  validateLocalSettings(context);
}

export function validateRuleIndexPaths(context, resolveConfigPath) {
  const { rootDir, warnings, errors } = context;

  console.log('\nValidating rule-index.json paths...');
  const ruleIndexPath = resolveConfigPath('rule-index.json', { read: true });
  if (context.exists(ruleIndexPath)) {
    try {
      const ruleIndexContent = context.read(ruleIndexPath, 'utf-8');
      const ruleIndex = JSON.parse(ruleIndexContent);

      const indexString = JSON.stringify(ruleIndex);
      if (indexString.includes('.claude/archive/')) {
        errors.push(
          'rule-index.json contains old .claude/archive/ paths. Run pnpm index-rules to regenerate.'
        );
      }

      if (ruleIndex.rules && Array.isArray(ruleIndex.rules)) {
        let missingPaths = 0;
        for (const rule of ruleIndex.rules.slice(0, 100)) {
          if (rule.path) {
            const rulePath = context.resolve(rootDir, rule.path);
            if (!context.exists(rulePath)) {
              missingPaths++;
              if (missingPaths <= 5) {
                errors.push(`rule-index.json references missing file: ${rule.path}`);
              }
            }
          }
        }

        if (missingPaths > 5) {
          errors.push(`rule-index.json references ${missingPaths} missing files (showing first 5)`);
        }
        if (missingPaths === 0) {
          console.log('  ✓ All checked rule paths exist');
        }
      }

      if (ruleIndex.archive_rules !== undefined) {
        warnings.push(
          'rule-index.json uses old "archive_rules" field. Should be "library_rules". Run pnpm index-rules to regenerate.'
        );
      }

      console.log('  ✓ rule-index.json structure validated');
    } catch (error) {
      errors.push(`Invalid JSON in rule-index.json: ${error.message}`);
    }
  } else {
    warnings.push('rule-index.json not found (optional, but recommended for rule-selector skill)');
  }
}

function validateToolSearchBlock(mcpConfig, errors) {
  if (typeof mcpConfig.toolSearch !== 'object' || mcpConfig.toolSearch === null) {
    errors.push('.mcp.json: toolSearch must be an object');
    return;
  }

  if (mcpConfig.toolSearch.enabled !== undefined && typeof mcpConfig.toolSearch.enabled !== 'boolean') {
    errors.push('.mcp.json: toolSearch.enabled must be a boolean');
  }

  if (
    mcpConfig.toolSearch.autoEnableThreshold !== undefined &&
    typeof mcpConfig.toolSearch.autoEnableThreshold !== 'number'
  ) {
    errors.push('.mcp.json: toolSearch.autoEnableThreshold must be a number');
  }

  if (
    mcpConfig.toolSearch.defaultDeferLoading !== undefined &&
    typeof mcpConfig.toolSearch.defaultDeferLoading !== 'boolean'
  ) {
    errors.push('.mcp.json: toolSearch.defaultDeferLoading must be a boolean');
  }
}

function validateMcpServersBlock(mcpConfig, warnings, errors) {
  if (typeof mcpConfig.mcpServers !== 'object' || mcpConfig.mcpServers === null) {
    errors.push('.mcp.json: mcpServers must be an object');
    return;
  }

  for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
    if (typeof serverConfig !== 'object' || serverConfig === null) {
      errors.push(`.mcp.json: Server ${serverName} config must be an object`);
      continue;
    }

    const validTypes = ['stdio', 'sse', 'http', 'sdk'];
    if (serverConfig.type && !validTypes.includes(serverConfig.type)) {
      warnings.push(`.mcp.json: Server ${serverName} has invalid type: ${serverConfig.type}`);
    }

    if (serverConfig.type === 'stdio' || !serverConfig.type) {
      if (!serverConfig.command) {
        warnings.push(`.mcp.json: Server ${serverName} (stdio) missing required field: command`);
      }
    } else if (serverConfig.type === 'sse' || serverConfig.type === 'http') {
      if (!serverConfig.url) {
        errors.push(`.mcp.json: Server ${serverName} (${serverConfig.type}) missing required field: url`);
      }
    } else if (serverConfig.type === 'sdk') {
      if (!serverConfig.name) {
        warnings.push(`.mcp.json: Server ${serverName} (sdk) missing name field`);
      }
    }
  }
}

function validateProjectSettings(context, mcpToolSearchEnabled) {
  const { rootDir, warnings, errors } = context;
  const settingsPath = '.claude/settings.json';

  if (context.exists(context.resolve(rootDir, settingsPath))) {
    try {
      const settingsContent = context.read(context.resolve(rootDir, settingsPath), 'utf-8');
      const settings = JSON.parse(settingsContent);

      if (mcpToolSearchEnabled) {
        const routerModel = String(settings?.models?.router ?? settings?.session?.default_model ?? '').trim();
        if (routerModel && routerModel.toLowerCase().includes('haiku')) {
          warnings.push(
            [
              '.mcp.json: toolSearch.enabled is true, but the router/default model is a Haiku variant.',
              'Claude Code disables tool search on models that do not support tool_reference blocks (observed in logs).',
              'Recommendation: set `.claude/settings.json` `models.router` to `claude-sonnet-4-5` (or Opus), or disable toolSearch.',
            ].join(' ')
          );
        }

        if (Array.isArray(settings.disallowedTools) && settings.disallowedTools.includes('MCPSearchTool')) {
          warnings.push(
            'settings.json: disallowedTools includes MCPSearchTool, which disables Tool Search even if enabled in .mcp.json.'
          );
        }
      }

      if (settings.agents && typeof settings.agents !== 'object') {
        warnings.push('settings.json: agents should be an object');
      }
      if (settings.allowedTools && !Array.isArray(settings.allowedTools)) {
        warnings.push('settings.json: allowedTools should be an array');
      }
      if (settings.disallowedTools && !Array.isArray(settings.disallowedTools)) {
        warnings.push('settings.json: disallowedTools should be an array');
      }
      if (settings.mcpServers && typeof settings.mcpServers !== 'object') {
        warnings.push('settings.json: mcpServers should be an object');
      }
      if (
        settings.permissionMode &&
        !['default', 'acceptEdits', 'bypassPermissions', 'plan'].includes(settings.permissionMode)
      ) {
        warnings.push(`settings.json: invalid permissionMode: ${settings.permissionMode}`);
      }

      if (settings.allowedTools && settings.disallowedTools) {
        const overlap = settings.allowedTools.filter(tool => settings.disallowedTools.includes(tool));
        if (overlap.length > 0) {
          warnings.push(
            `settings.json: Tools in both allowedTools and disallowedTools: ${overlap.join(', ')}`
          );
        }
      }

      console.log('  ✓ settings.json validated');
    } catch (error) {
      errors.push(`Invalid JSON in settings.json: ${error.message}`);
    }
  } else {
    warnings.push('settings.json not found (optional, but recommended)');
  }
}

function validateLocalSettings(context) {
  const { rootDir, warnings, errors } = context;
  const localSettingsPath = '.claude/settings.local.json';

  if (context.exists(context.resolve(rootDir, localSettingsPath))) {
    try {
      const localSettingsContent = context.read(context.resolve(rootDir, localSettingsPath), 'utf-8');
      const localSettings = JSON.parse(localSettingsContent);

      if (localSettings.allowedTools && !Array.isArray(localSettings.allowedTools)) {
        warnings.push('settings.local.json: allowedTools should be an array');
      }
      if (localSettings.disallowedTools && !Array.isArray(localSettings.disallowedTools)) {
        warnings.push('settings.local.json: disallowedTools should be an array');
      }

      console.log('  ✓ settings.local.json validated (local settings)');
    } catch (error) {
      errors.push(`Invalid JSON in settings.local.json: ${error.message}`);
    }
  } else {
    console.log('  ℹ️  settings.local.json not found (optional, gitignored)');
  }
}
