export function validateSkillStructure(context) {
  const { rootDir, errors, checkDirectory } = context;

  console.log('\nValidating skill structure...');
  const skillsDir = '.claude/skills';
  checkDirectory(skillsDir, 'skills directory');

  const skillFiles = [];
  try {
    const skillDirs = context.readdir(context.resolve(rootDir, skillsDir), { withFileTypes: true });
    for (const dirent of skillDirs) {
      if (dirent.isDirectory() && dirent.name !== 'sdk') {
        const skillFile = context.resolve(rootDir, skillsDir, dirent.name, 'SKILL.md');
        if (context.exists(skillFile)) {
          skillFiles.push({ path: skillFile, name: dirent.name });
        }
      }
    }
  } catch (error) {
    errors.push(`Error reading skills directory: ${error.message}`);
  }

  for (const { path, name } of skillFiles) {
    validateAgentSkillFile(context, path, name);
  }

  console.log('\nValidating codex-skills structure...');
  const codexSkillsDir = 'codex-skills';
  if (context.exists(context.resolve(rootDir, codexSkillsDir))) {
    try {
      const codexSkillDirs = context.readdir(context.resolve(rootDir, codexSkillsDir), {
        withFileTypes: true,
      });
      for (const dirent of codexSkillDirs) {
        if (!dirent.isDirectory()) {
          continue;
        }

        const skillFile = context.resolve(rootDir, codexSkillsDir, dirent.name, 'SKILL.md');
        if (context.exists(skillFile)) {
          validateCodexSkillFile(context, skillFile, dirent.name);
        }
      }
    } catch (error) {
      errors.push(`Error reading codex-skills directory: ${error.message}`);
    }
  } else {
    console.log('  ℹ️  codex-skills directory not found (optional)');
  }

  return skillFiles;
}

function validateAgentSkillFile(context, path, name) {
  const { yaml, warnings, errors } = context;

  try {
    const content = context.read(path, 'utf-8');
    const normalizedContent = content.replace(/\r\n/g, '\n');
    if (!normalizedContent.startsWith('---\n')) {
      errors.push(`Skill ${name}: Missing YAML frontmatter (must start with ---)`);
      return;
    }

    const frontmatterEnd = normalizedContent.indexOf('\n---\n', 4);
    if (frontmatterEnd === -1) {
      errors.push(`Skill ${name}: Invalid YAML frontmatter (missing closing ---)`);
      return;
    }

    const frontmatter = normalizedContent.substring(4, frontmatterEnd);
    if (yaml) {
      try {
        const parsed = yaml.load(frontmatter);

        const requiredFields = ['name', 'description'];
        for (const field of requiredFields) {
          if (!(field in parsed)) {
            errors.push(`Skill ${name}: Missing required field: ${field}`);
          }
        }

        const recommendedFields = ['tools', 'version'];
        for (const field of recommendedFields) {
          if (!(field in parsed)) {
            warnings.push(`Skill ${name}: Missing recommended field: ${field}`);
          }
        }

        if (parsed.name && parsed.name !== name) {
          warnings.push(`Skill ${name}: Frontmatter name "${parsed.name}" doesn't match directory name`);
        }

        if (parsed['context:fork'] !== undefined && typeof parsed['context:fork'] !== 'boolean') {
          errors.push(
            `Skill ${name}: context:fork must be boolean, got ${typeof parsed['context:fork']}`
          );
        }

        if (parsed.model !== undefined) {
          const validModels = ['haiku', 'sonnet', 'opus'];
          if (!validModels.includes(parsed.model)) {
            errors.push(
              `Skill ${name}: model must be one of: ${validModels.join(', ')}, got '${parsed.model}'`
            );
          }
        }

        console.log(`  ✓ Skill validated: ${name}`);
      } catch (yamlError) {
        errors.push(`Skill ${name}: Invalid YAML frontmatter - ${yamlError.message}`);
      }
    } else {
      const requiredFields = ['name:', 'description:'];
      for (const field of requiredFields) {
        if (!frontmatter.includes(field)) {
          errors.push(`Skill ${name}: Missing required field: ${field.replace(':', '')}`);
        }
      }

      const recommendedFields = ['tools:', 'version:'];
      for (const field of recommendedFields) {
        if (!frontmatter.includes(field)) {
          warnings.push(`Skill ${name}: Missing recommended field: ${field.replace(':', '')}`);
        }
      }
      console.log(`  ⚠️  Skill ${name}: Basic validation (YAML parser not available)`);
    }
  } catch (error) {
    errors.push(`Error reading skill file ${name}: ${error.message}`);
  }
}

function validateCodexSkillFile(context, skillFile, dirName) {
  const { yaml, warnings, errors } = context;

  const content = context.read(skillFile, 'utf-8');
  const normalizedContent = content.replace(/\r\n/g, '\n');
  if (!normalizedContent.startsWith('---\n')) {
    errors.push(`Codex Skill ${dirName}: Missing YAML frontmatter (must start with ---)`);
    return;
  }

  const frontmatterEnd = normalizedContent.indexOf('\n---\n', 4);
  if (frontmatterEnd === -1) {
    errors.push(`Codex Skill ${dirName}: Invalid YAML frontmatter (missing closing ---)`);
    return;
  }

  const frontmatter = normalizedContent.substring(4, frontmatterEnd);
  if (yaml) {
    try {
      const parsed = yaml.load(frontmatter);

      const requiredFields = ['name', 'description'];
      for (const field of requiredFields) {
        if (!(field in parsed)) {
          errors.push(`Codex Skill ${dirName}: Missing required field: ${field}`);
        }
      }

      if (parsed.name && parsed.name !== dirName) {
        warnings.push(
          `Codex Skill ${dirName}: Frontmatter name "${parsed.name}" doesn't match directory name`
        );
      }

      if (parsed.model !== undefined) {
        const validModels = ['haiku', 'sonnet', 'opus'];
        if (!validModels.includes(parsed.model)) {
          errors.push(
            `Codex Skill ${dirName}: model must be one of: ${validModels.join(', ')}, got '${parsed.model}'`
          );
        }
      }

      if (parsed['context:fork'] !== undefined && typeof parsed['context:fork'] !== 'boolean') {
        errors.push(
          `Codex Skill ${dirName}: context:fork must be boolean, got ${typeof parsed['context:fork']}`
        );
      }

      console.log(`  ✓ Codex Skill validated: ${dirName}`);
    } catch (yamlError) {
      errors.push(`Codex Skill ${dirName}: Invalid YAML frontmatter - ${yamlError.message}`);
    }
  } else {
    const requiredFields = ['name:', 'description:'];
    for (const field of requiredFields) {
      if (!frontmatter.includes(field)) {
        errors.push(`Codex Skill ${dirName}: Missing required field: ${field.replace(':', '')}`);
      }
    }
    console.log(`  ⚠️  Codex Skill ${dirName}: Basic validation (YAML parser not available)`);
  }
}
