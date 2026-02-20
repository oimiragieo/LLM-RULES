'use strict';

/**
 * python-backend-expert pre-execute hook
 * Validates inputs and warns about missing Python backend strategy details.
 */

function preExecute(input = {}) {
  const warnings = [];

  // Required field: task
  if (!input.task || typeof input.task !== 'string' || input.task.trim() === '') {
    return {
      continue: false,
      error: 'Input validation failed: "task" is required and must be a non-empty string.',
    };
  }

  // Warn if no framework specified for non-trivial tasks
  const validFrameworks = ['fastapi', 'django', 'flask', 'litestar', 'none'];
  if (!input.framework) {
    warnings.push(
      'No "framework" specified. Defaulting to generic Python backend guidance. ' +
        `Supported: ${validFrameworks.join(', ')}.`
    );
  } else if (!validFrameworks.includes(input.framework)) {
    warnings.push(
      `Unknown framework "${input.framework}". Supported: ${validFrameworks.join(', ')}.`
    );
  }

  // Warn if no type hints strategy noted
  if (!input.pythonVersion) {
    warnings.push(
      'No "pythonVersion" specified. Defaulting to 3.12+ patterns. ' +
        'Set pythonVersion to "3.10", "3.12", or "3.13" for version-specific advice.'
    );
  }

  // Warn about async mode for FastAPI
  if (input.framework === 'fastapi' && input.asyncMode === false) {
    warnings.push(
      'asyncMode is set to false for FastAPI. FastAPI strongly prefers async def ' +
        'for I/O-bound endpoint handlers. Consider setting asyncMode: true.'
    );
  }

  // Warn if ORM specified without framework context
  const validOrms = ['sqlalchemy', 'tortoise', 'django-orm', 'none'];
  if (input.ormChoice && !validOrms.includes(input.ormChoice)) {
    warnings.push(`Unknown ORM "${input.ormChoice}". Supported: ${validOrms.join(', ')}.`);
  }

  if (input.ormChoice === 'django-orm' && input.framework && input.framework !== 'django') {
    warnings.push(
      'django-orm is only compatible with Django. Consider sqlalchemy or tortoise for other frameworks.'
    );
  }

  return {
    continue: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

module.exports = { preExecute };
