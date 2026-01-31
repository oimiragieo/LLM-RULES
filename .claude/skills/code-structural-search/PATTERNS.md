# ast-grep Pattern Library

Comprehensive pattern reference for all supported languages.

## Pattern Syntax Reference

| Symbol     | Meaning                         | Example                           |
| ---------- | ------------------------------- | --------------------------------- |
| `$NAME`    | Single identifier/node          | `function $NAME() {}`             |
| `$$$`      | Zero or more statements/nodes   | `class $NAME { $$$ }`             |
| `$$`       | Zero or more statements (block) | `if ($COND) { $$ }`               |
| `$_`       | Anonymous wildcard (discard)    | `console.log($_)`                 |
| `$...REST` | Rest parameters/arguments       | `function $NAME($...ARGS) { $$ }` |

## JavaScript/TypeScript Patterns

### Functions

```bash
# All functions
sg -p 'function $NAME($$$) { $$ }' --lang js

# Async functions
sg -p 'async function $NAME($$$) { $$ }' --lang ts

# Arrow functions
sg -p 'const $NAME = ($$$) => { $$ }' --lang js

# Functions with exactly 3 parameters
sg -p 'function $NAME($A, $B, $C) { $$ }' --lang js

# Functions returning promises
sg -p 'function $NAME($$$): Promise<$TYPE> { $$ }' --lang ts

# Generator functions
sg -p 'function* $NAME($$$) { $$ }' --lang js
```

### Classes

```bash
# All classes
sg -p 'class $NAME { $$$ }' --lang ts

# Classes extending another
sg -p 'class $NAME extends $BASE { $$$ }' --lang ts

# Classes implementing interface
sg -p 'class $NAME implements $INTERFACE { $$$ }' --lang ts

# Class constructors
sg -p 'constructor($$$) { $$ }' --lang ts

# Class methods
sg -p 'class $NAME { $METHOD($$$) { $$ } }' --lang ts

# Async class methods
sg -p 'async $METHOD($$$) { $$ }' --lang ts
```

### TypeScript Specifics

```bash
# Type definitions
sg -p 'type $NAME = $$$' --lang ts

# Interface definitions
sg -p 'interface $NAME { $$$ }' --lang ts

# Enum definitions
sg -p 'enum $NAME { $$$ }' --lang ts

# Generic functions
sg -p 'function $NAME<$TYPE>($$$) { $$ }' --lang ts

# Type assertions
sg -p '$VAR as $TYPE' --lang ts
```

### Imports/Exports

```bash
# Named imports
sg -p 'import { $$$ } from $MODULE' --lang js

# Default imports
sg -p 'import $NAME from $MODULE' --lang js

# Named exports
sg -p 'export { $$$ }' --lang js

# Default exports
sg -p 'export default $$$' --lang js

# Re-exports
sg -p 'export * from $MODULE' --lang js
```

### Error Handling

```bash
# Try-catch blocks
sg -p 'try { $$ } catch ($ERR) { $$ }' --lang js

# Try-catch-finally
sg -p 'try { $$ } catch ($ERR) { $$ } finally { $$ }' --lang js

# Throw statements
sg -p 'throw new $ERROR($$$)' --lang js
```

### Async/Promises

```bash
# Promise chains
sg -p '$PROMISE.then($$$)' --lang js

# Async/await
sg -p 'await $PROMISE' --lang js

# Promise.all
sg -p 'Promise.all([$$$])' --lang js
```

### React Patterns

```bash
# Functional components
sg -p 'function $NAME($PROPS) { return $$$ }' --lang tsx

# React.FC components
sg -p 'const $NAME: React.FC<$PROPS> = ($$$) => { $$ }' --lang tsx

# useState hooks
sg -p 'const [$STATE, $SETTER] = useState($$$)' --lang tsx

# useEffect hooks
sg -p 'useEffect(() => { $$ }, [$$$])' --lang tsx

# Class components
sg -p 'class $NAME extends React.Component { $$$ }' --lang tsx

# Component props destructuring
sg -p 'function $NAME({ $$$ }) { $$ }' --lang tsx
```

## Python Patterns

### Functions

```bash
# All functions
sg -p 'def $NAME($$$): $$$' --lang py

# Async functions
sg -p 'async def $NAME($$$): $$$' --lang py

# Functions with decorators
sg -p '@$DECORATOR\ndef $NAME($$$): $$$' --lang py

# Functions with type hints
sg -p 'def $NAME($ARGS) -> $RETURN: $$$' --lang py

# Lambda functions
sg -p 'lambda $ARGS: $$$' --lang py
```

### Classes

```bash
# All classes
sg -p 'class $NAME: $$$' --lang py

# Classes with inheritance
sg -p 'class $NAME($BASE): $$$' --lang py

# Classes with metaclass
sg -p 'class $NAME(metaclass=$META): $$$' --lang py

# __init__ methods
sg -p 'def __init__(self, $$$): $$$' --lang py

# Class methods
sg -p '@classmethod\ndef $NAME($$$): $$$' --lang py

# Static methods
sg -p '@staticmethod\ndef $NAME($$$): $$$' --lang py
```

### Imports

```bash
# Import statements
sg -p 'import $MODULE' --lang py

# From imports
sg -p 'from $MODULE import $$$' --lang py

# Relative imports
sg -p 'from .$MODULE import $$$' --lang py

# Import aliases
sg -p 'import $MODULE as $ALIAS' --lang py
```

### Error Handling

```bash
# Try-except blocks
sg -p 'try: $$$\nexcept $EXC: $$$' --lang py

# Try-except-finally
sg -p 'try: $$$\nexcept $EXC: $$$\nfinally: $$$' --lang py

# Raise statements
sg -p 'raise $EXCEPTION($$$)' --lang py
```

### Context Managers

```bash
# With statements
sg -p 'with $CONTEXT as $VAR: $$$' --lang py

# Multiple contexts
sg -p 'with $CTX1 as $VAR1, $CTX2 as $VAR2: $$$' --lang py
```

### Comprehensions

```bash
# List comprehensions
sg -p '[$EXPR for $VAR in $ITER]' --lang py

# Dict comprehensions
sg -p '{$KEY: $VALUE for $VAR in $ITER}' --lang py

# Generator expressions
sg -p '($EXPR for $VAR in $ITER)' --lang py
```

## Go Patterns

### Functions

```bash
# All functions
sg -p 'func $NAME($$$) $RETURN { $$ }' --lang go

# Methods
sg -p 'func ($RECV $TYPE) $NAME($$$) $RETURN { $$ }' --lang go

# Variadic functions
sg -p 'func $NAME($ARGS ...$TYPE) { $$ }' --lang go

# Functions with named returns
sg -p 'func $NAME($$$) (result $TYPE) { $$ }' --lang go
```

### Types

```bash
# Struct definitions
sg -p 'type $NAME struct { $$$ }' --lang go

# Interface definitions
sg -p 'type $NAME interface { $$$ }' --lang go

# Type aliases
sg -p 'type $NAME $TYPE' --lang go
```

### Error Handling

```bash
# If err != nil pattern
sg -p 'if err != nil { $$ }' --lang go

# Error returns
sg -p 'return $$$, err' --lang go
```

### Goroutines

```bash
# Go statements
sg -p 'go $FUNC($$$)' --lang go

# Go anonymous functions
sg -p 'go func($$$) { $$ }($$$)' --lang go
```

### Channels

```bash
# Channel creation
sg -p 'make(chan $TYPE)' --lang go

# Channel send
sg -p '$CHAN <- $VALUE' --lang go

# Channel receive
sg -p '$VALUE := <-$CHAN' --lang go

# Select statements
sg -p 'select { $$$ }' --lang go
```

## Rust Patterns

### Functions

```bash
# All functions
sg -p 'fn $NAME($$$) -> $RETURN { $$ }' --lang rs

# Public functions
sg -p 'pub fn $NAME($$$) -> $RETURN { $$ }' --lang rs

# Async functions
sg -p 'async fn $NAME($$$) -> $RETURN { $$ }' --lang rs

# Unsafe functions
sg -p 'unsafe fn $NAME($$$) { $$ }' --lang rs
```

### Structs & Impls

```bash
# Struct definitions
sg -p 'struct $NAME { $$$ }' --lang rs

# Impl blocks
sg -p 'impl $NAME { $$$ }' --lang rs

# Trait impls
sg -p 'impl $TRAIT for $TYPE { $$$ }' --lang rs
```

### Error Handling

```bash
# Match expressions
sg -p 'match $EXPR { $$$ }' --lang rs

# Result unwrap
sg -p '$EXPR.unwrap()' --lang rs

# Question mark operator
sg -p '$EXPR?' --lang rs

# If let pattern
sg -p 'if let $PATTERN = $EXPR { $$ }' --lang rs
```

### Memory Safety

```bash
# Unsafe blocks
sg -p 'unsafe { $$ }' --lang rs

# Raw pointers
sg -p '*const $TYPE' --lang rs
sg -p '*mut $TYPE' --lang rs
```

## Java Patterns

### Classes & Methods

```bash
# Public classes
sg -p 'public class $NAME { $$$ }' --lang java

# Public methods
sg -p 'public $RETURN $NAME($$$) { $$ }' --lang java

# Static methods
sg -p 'public static $RETURN $NAME($$$) { $$ }' --lang java

# Abstract methods
sg -p 'abstract $RETURN $NAME($$$);' --lang java
```

### Interfaces

```bash
# Interface definitions
sg -p 'public interface $NAME { $$$ }' --lang java

# Classes implementing interfaces
sg -p 'public class $NAME implements $INTERFACE { $$$ }' --lang java
```

### Error Handling

```bash
# Try-catch blocks
sg -p 'try { $$ } catch ($EXC $VAR) { $$ }' --lang java

# Try-with-resources
sg -p 'try ($RESOURCE) { $$ }' --lang java

# Throw statements
sg -p 'throw new $EXCEPTION($$$)' --lang java
```

## Security Patterns (Cross-Language)

### SQL Injection

```bash
# JavaScript string template SQL (vulnerable)
sg -p 'db.query(`SELECT * FROM ${$VAR}`)' --lang js

# Python string format SQL (vulnerable)
sg -p 'cursor.execute(f"SELECT * FROM {$VAR}")' --lang py
```

### Command Injection

```bash
# JavaScript exec (vulnerable)
sg -p 'exec($CMD)' --lang js

# Python os.system (vulnerable)
sg -p 'os.system($CMD)' --lang py
```

### XSS

```bash
# JavaScript innerHTML (vulnerable)
sg -p '$ELEM.innerHTML = $DATA' --lang js

# Dangerously set HTML in React
sg -p 'dangerouslySetInnerHTML={{ __html: $DATA }}' --lang tsx
```

### Authentication

```bash
# Missing authentication checks
sg -p 'router.post($PATH, ($REQ, $RES) => { $$ })' --lang js

# Find auth middleware usage
sg -p 'router.post($PATH, authenticate, ($REQ, $RES) => { $$ })' --lang js
```

## Code Quality Patterns

### Complexity

```bash
# Deeply nested if statements (>3 levels)
sg -p 'if ($COND1) { if ($COND2) { if ($COND3) { if ($COND4) { $$ } } } }' --lang js

# Long parameter lists (>5 params)
sg -p 'function $NAME($A, $B, $C, $D, $E, $F, $$$) { $$ }' --lang js
```

### Dead Code

```bash
# Unused variables (require manual verification)
sg -p 'const $NAME = $VALUE;' --lang js

# Console.log statements (cleanup before production)
sg -p 'console.log($$$)' --lang js

# Debugger statements
sg -p 'debugger' --lang js
```

### Deprecated APIs

```bash
# Find old API usage
sg -p 'oldAPI.deprecatedMethod($$$)' --lang js

# Find callback patterns (convert to async/await)
sg -p '$FUNC($ARGS, ($ERR, $DATA) => { $$ })' --lang js
```

## Usage Tips

### Combining Patterns

Use multiple patterns for complex searches:

```bash
# Find all async functions with try-catch
sg -p 'async function $NAME($$$) { try { $$ } catch { $$ } }' --lang js

# Find classes with specific method
sg -p 'class $NAME { authenticate($$$) { $$ } }' --lang ts
```

### Output Formats

```bash
# JSON output for parsing
sg -p '$PATTERN' --lang js --json

# Show context lines
sg -p '$PATTERN' --lang js -A 3 -B 3

# Only show matches (no filenames)
sg -p '$PATTERN' --lang js --heading=never
```

### Performance

```bash
# Search specific directory
sg -p '$PATTERN' --lang js src/

# Exclude directories
sg -p '$PATTERN' --lang js --no-ignore tests/

# Parallel search (faster for large codebases)
sg -p '$PATTERN' --lang js --threads 4
```

## Common Workflows

### 1. Security Audit

```bash
# Step 1: Find all routes
sg -p 'router.$METHOD($PATH, $$$)' --lang js

# Step 2: Find routes without auth
sg -p 'router.$METHOD($PATH, ($REQ, $RES) => { $$ })' --lang js

# Step 3: Find SQL queries
sg -p 'db.query($$$)' --lang js
```

### 2. Refactoring

```bash
# Step 1: Find old pattern
sg -p 'oldAPI.method($$$)' --lang js

# Step 2: Replace with new pattern (manual or scripted)
# oldAPI.method() → newAPI.method()
```

### 3. Code Review

```bash
# Step 1: Find functions without error handling
sg -p 'function $NAME($$$) { $$ }' --lang js | grep -v 'try'

# Step 2: Find long functions (>50 lines - manual count)
sg -p 'function $NAME($$$) { $$ }' --lang js

# Step 3: Find complex conditionals
sg -p 'if ($COND1 && $COND2 && $COND3 && $COND4) { $$ }' --lang js
```

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
