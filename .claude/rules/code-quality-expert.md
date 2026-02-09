# Code Quality Expert Rules

## Core Rules

- Focus on readability over cleverness
- Maintain consistency within the codebase
- Leave code better than you found it (progressive improvement)
- Apply relevant paradigms and principles
- Use semantic naming and abstractions

## Constants Over Magic Numbers

- Replace hard-coded values with named constants
- Use descriptive constant names that explain the value's purpose
- Keep constants at the top of the file or in a dedicated constants file

**Example:**
```typescript
// ❌ BAD
if (status === 200) { }

// ✅ GOOD
const HTTP_OK = 200;
if (status === HTTP_OK) { }
```

## Meaningful Names

- Variables, functions, and classes should reveal their purpose
- Names should explain why something exists and how it's used
- Avoid abbreviations unless they're universally understood

**Example:**
```typescript
// ❌ BAD
const d = new Date();
const usr = getUser();

// ✅ GOOD
const currentDate = new Date();
const authenticatedUser = getUser();
```

## Smart Comments

- Don't comment on what the code does - make the code self-documenting
- Use comments to explain why something is done a certain way
- Document APIs, complex algorithms, and non-obvious side effects

**Example:**
```typescript
// ❌ BAD
// Increment counter by 1
counter++;

// ✅ GOOD
// Rate limiter requires 1-second delay between requests per RFC 6585
await delay(1000);
```

## Single Responsibility

- Each function should do exactly one thing
- Functions should be small and focused
- If a function needs a comment to explain what it does, it should be split

**Example:**
```typescript
// ❌ BAD
function processUserDataAndSendEmail(user) {
  validateUser(user);
  saveToDatabase(user);
  sendWelcomeEmail(user.email);
}

// ✅ GOOD
function processUser(user) {
  validateUser(user);
  saveToDatabase(user);
}

function notifyUser(user) {
  sendWelcomeEmail(user.email);
}
```

## DRY (Don't Repeat Yourself)

- Extract repeated code into reusable functions
- Share common logic through proper abstraction
- Maintain single sources of truth

**Example:**
```typescript
// ❌ BAD
const result1 = await fetch(url1).then(r => r.json());
const result2 = await fetch(url2).then(r => r.json());

// ✅ GOOD
async function fetchJSON(url) {
  return await fetch(url).then(r => r.json());
}
const result1 = await fetchJSON(url1);
const result2 = await fetchJSON(url2);
```

## Clean Structure

- Keep related code together
- Organize code in a logical hierarchy
- Use consistent file and folder naming conventions

## Encapsulation

- Hide implementation details
- Expose clear interfaces
- Move nested conditionals into well-named functions

**Example:**
```typescript
// ❌ BAD
if (user && user.age >= 18 && user.verified) {
  // ...
}

// ✅ GOOD
function isEligibleUser(user) {
  return user && user.age >= 18 && user.verified;
}

if (isEligibleUser(user)) {
  // ...
}
```

## Code Quality Maintenance

- Refactor continuously
- Fix technical debt early
- Leave code cleaner than you found it

## Testing

- Write tests before fixing bugs
- Keep tests readable and maintainable
- Test edge cases and error conditions

## Version Control

- Write clear commit messages
- Make small, focused commits
- Use meaningful branch names

## Anti-Patterns

- Premature optimization (optimize after profiling)
- God objects (classes that do too much)
- Magic numbers (use named constants)
- Deep nesting (extract functions)
- Tight coupling (use dependency injection)

## Related Skills

- `code-analyzer` - Static code analysis
- `code-style-validator` - Style validation
- `best-practices-guidelines` - General best practices
- `dry-principle` - Don't Repeat Yourself principle

## Related References

- `.claude/skills/code-quality-expert/SKILL.md` - Complete code quality documentation
- `.claude/rules/code-standards.md` - Code organization and style
- `.claude/rules/testing.md` - Testing guidelines
