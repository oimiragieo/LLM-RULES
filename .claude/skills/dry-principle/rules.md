---
paths:
  - .claude/skills/dry-principle/**
---

# DRY Principle Rules

## Core Rules

- Don't Repeat Yourself - every piece of knowledge should have a single representation
- Extract repeated code into reusable functions
- Share common logic through proper abstraction
- Maintain single sources of truth

## The DRY Principle

**Definition**: Every piece of knowledge must have a single, unambiguous, authoritative representation within a system.

**Key Insight**: DRY is about reducing repetition of _information_ and _knowledge_, not just code.

## When to Apply DRY

### Code Duplication

```typescript
// ❌ BAD - Repeated validation logic
function createUser(data) {
  if (!data.email || !data.email.includes('@')) throw new Error('Invalid email');
  // ...
}

function updateUser(data) {
  if (!data.email || !data.email.includes('@')) throw new Error('Invalid email');
  // ...
}

// ✅ GOOD - Extracted validation
function validateEmail(email) {
  if (!email || !email.includes('@')) throw new Error('Invalid email');
}

function createUser(data) {
  validateEmail(data.email);
  // ...
}

function updateUser(data) {
  validateEmail(data.email);
  // ...
}
```

### Configuration Duplication

```typescript
// ❌ BAD - Repeated configuration
const API_URL_DEV = 'https://dev.api.example.com';
const API_URL_PROD = 'https://api.example.com';
// ... repeated in multiple files

// ✅ GOOD - Single source of truth
// config.ts
export const API_URL =
  process.env.NODE_ENV === 'production' ? 'https://api.example.com' : 'https://dev.api.example.com';
```

### Business Logic Duplication

```typescript
// ❌ BAD - Repeated business rules
function canPurchase(user) {
  return user.age >= 18 && user.verified;
}

function canVote(user) {
  return user.age >= 18 && user.verified;
}

// ✅ GOOD - Extracted common rule
function isEligibleUser(user) {
  return user.age >= 18 && user.verified;
}

function canPurchase(user) {
  return isEligibleUser(user);
}

function canVote(user) {
  return isEligibleUser(user);
}
```

## When NOT to Apply DRY

### Coincidental Similarity

```typescript
// DON'T extract - these are coincidentally similar
function formatUserName(user) {
  return `${user.firstName} ${user.lastName}`;
}

function formatProductName(product) {
  return `${product.brand} ${product.model}`;
}
```

These serve different purposes even if they look similar. Extracting would couple unrelated concepts.

### Premature Abstraction

Wait until you have 3+ instances of duplication before extracting. The "Rule of Three":

1. First time: Write it
2. Second time: Wince at duplication, but write it again
3. Third time: Refactor and extract

## Levels of DRY

### 1. Function Level

Extract repeated code blocks into functions.

### 2. Module Level

Share common utilities across files.

### 3. Package Level

Create shared libraries for cross-project code.

### 4. Data Level

Single source of truth for data and configuration.

## DRY vs WET

**WET** = Write Everything Twice (or "We Enjoy Typing")

WET code has:

- Repeated logic
- Multiple sources of truth
- High maintenance cost
- Bug-prone (fix in one place, forget others)

## Best Practices

### Extract Constants

```typescript
// ❌ BAD
if (status === 200) {
}
if (status === 404) {
}

// ✅ GOOD
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
if (status === HTTP_OK) {
}
if (status === HTTP_NOT_FOUND) {
}
```

### Extract Utility Functions

```typescript
// ❌ BAD
const result1 = await fetch(url1).then(r => r.json());
const result2 = await fetch(url2).then(r => r.json());

// ✅ GOOD
async function fetchJSON(url) {
  const response = await fetch(url);
  return response.json();
}
const result1 = await fetchJSON(url1);
const result2 = await fetchJSON(url2);
```

### Use Inheritance/Composition

```typescript
// ❌ BAD - Repeated validation in multiple classes
class User {
  validateEmail() {
    /* ... */
  }
}
class Admin {
  validateEmail() {
    /* ... */
  } // Duplicate
}

// ✅ GOOD - Shared base class
class Entity {
  validateEmail() {
    /* ... */
  }
}
class User extends Entity {}
class Admin extends Entity {}
```

### Configuration as Code

Store configuration in one place (environment variables, config files).

## Anti-Patterns

### Over-DRYing

- Extracting too early (before pattern is clear)
- Creating unnecessary abstractions
- Coupling unrelated code

### Under-DRYing

- Copy-paste programming
- Multiple sources of truth
- Repeated business logic

## Measuring DRY Violations

Tools to detect duplication:

- **jscpd** (JavaScript Copy/Paste Detector)
- **PMD** (Java)
- **pylint** (Python)

Target: < 5% code duplication

## Related Skills

- `code-quality-expert` - Code quality principles
- `best-practices-guidelines` - General best practices
- `code-analyzer` - Static code analysis (detects duplication)

## Related References

- `.claude/skills/dry-principle/SKILL.md` - Complete DRY documentation
- `.claude/rules/code-standards.md` - Code organization
- `.claude/rules/code-quality-expert.md` - Clean code principles
