# modern-python Rules

## Purpose

Modern Python tooling best practices using uv, ruff, ty, and pytest. Mandates the Trail of Bits Python coding standards for project setup, dependency management, linting, type checking, and testing. Based on patterns from trailofbits/cookiecutter-python.

## Best Practices

- Always use uv for dependency management instead of pip/Poetry/pipenv
- Use ruff for both linting and formatting instead of separate tools
- Use ty for type checking instead of mypy (faster, Rust-based)
- Structure tests with pytest and use hypothesis for property-based testing
- Configure all tools in pyproject.toml, never in separate config files

## Integration Points

See SKILL.md for complete documentation.
