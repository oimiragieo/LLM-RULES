# Best Practices Guidelines

## Core Rules

- Follow RESTful API design principles
- Implement responsive design patterns
- Use schema validation (Zod, JSON Schema)
- Regularly update dependencies
- Apply domain-specific best practices

## API Design

### RESTful Principles

- Use HTTP verbs correctly (GET, POST, PUT, DELETE, PATCH)
- Resource-based URLs (`/users`, `/users/:id`)
- Proper status codes (200, 201, 400, 401, 404, 500)
- Versioning in URL (`/api/v1/users`)
- Pagination for collections (`?page=1&limit=20`)

**Example:**

```
GET    /api/v1/users       - List users
POST   /api/v1/users       - Create user
GET    /api/v1/users/:id   - Get user
PUT    /api/v1/users/:id   - Update user
DELETE /api/v1/users/:id   - Delete user
```

## Responsive Design

### Mobile-First Approach

- Design for mobile first, then scale up
- Use relative units (rem, em, %) not pixels
- Breakpoints: 640px (sm), 768px (md), 1024px (lg), 1280px (xl)
- Touch-friendly targets (min 44x44px)
- Optimize images for different screen sizes

**Example:**

```css
/* Mobile first */
.container {
  width: 100%;
}

/* Tablet and up */
@media (min-width: 768px) {
  .container {
    width: 750px;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .container {
    width: 960px;
  }
}
```

## Data Validation

### Schema Validation with Zod

- Define schemas at API boundaries
- Validate all user input
- Parse before processing
- Use type inference for TypeScript

**Example:**

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive(),
});

// Validate and parse
const user = UserSchema.parse(input); // Throws on invalid
const result = UserSchema.safeParse(input); // Returns result object
```

## Dependency Management

### Keep Dependencies Updated

- Run `pnpm audit` regularly
- Update dependencies monthly
- Test after updates
- Use lock files (pnpm-lock.yaml)
- Review CVE databases for critical packages

**Commands:**

```bash
# Check for outdated packages
pnpm outdated

# Update all dependencies
pnpm update

# Update specific package
pnpm update <package-name>

# Audit for vulnerabilities
pnpm audit

# Fix vulnerabilities automatically
pnpm audit --fix
```

## Security Best Practices

- Never commit secrets to version control
- Use environment variables for configuration
- Validate all user input
- Parameterize database queries
- Use HTTPS everywhere
- Implement rate limiting
- Add CORS headers correctly

## Performance Best Practices

- Lazy load resources
- Cache appropriately
- Minimize bundle size
- Use CDN for static assets
- Optimize database queries (indexes, no N+1)
- Implement pagination for large datasets

## Accessibility Best Practices

- Use semantic HTML (nav, main, article, section)
- Add ARIA labels where needed
- Ensure keyboard navigation works
- Maintain color contrast ratios (WCAG 2.1 AA)
- Provide alt text for images
- Test with screen readers

## Testing Best Practices

- Write tests first (TDD)
- Test edge cases and error conditions
- Keep tests fast and isolated
- Mock external dependencies
- Aim for 80%+ code coverage
- Test at multiple levels (unit, integration, E2E)

## Code Organization Best Practices

- Use consistent naming conventions
- Keep files focused and small (<300 lines)
- Organize by feature, not type
- Separate concerns (presentation, logic, data)
- Use clear folder structure

## Documentation Best Practices

- Keep README up to date
- Document public APIs
- Add inline comments for complex logic
- Include examples in documentation
- Maintain CHANGELOG
- Write clear commit messages

## Anti-Patterns

- Ignoring security updates
- Not validating user input
- Premature optimization
- Over-engineering solutions
- Inconsistent coding style
- Poor error handling

## Framework-Specific Best Practices

### React

- Use hooks over class components
- Memoize expensive computations
- Avoid prop drilling (use context)
- Keep components small and focused

### Node.js

- Use async/await over callbacks
- Handle errors explicitly
- Use process managers (PM2)
- Implement graceful shutdown

### Python

- Follow PEP 8 style guide
- Use virtual environments
- Type hints on public functions
- Docstrings for modules and functions

## Related Skills

- `code-quality-expert` - Code quality principles
- `security-architect` - Security best practices
- `dry-principle` - Don't Repeat Yourself principle
- `architecture-review` - Architecture validation

## Related References

- `.claude/skills/best-practices-guidelines/SKILL.md` - Complete guidelines
- `.claude/rules/code-standards.md` - Code organization
- `.claude/rules/security.md` - Security guidelines
- `.claude/rules/testing.md` - Testing guidelines
