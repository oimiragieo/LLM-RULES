# Google Python Style Guide Summary (Python 3.12+)

This document summarizes key rules and best practices from the Google Python Style Guide, updated for Python 3.12+ with modern patterns.

## 1. Python Language Rules (Modern Patterns)

- **Linting:** Use `ruff` as the recommended linter (replaces flake8/pylint). Run `ruff check` on your code to catch bugs and style issues.
- **Package Manager:** Use `uv` for fast, reliable dependency management. Install via: `pip install uv` or platform package manager.
- **Imports:** Use `import x` for packages/modules. Use `from x import y` only when `y` is a submodule.
- **Exceptions:** Use built-in exception classes. Do not use bare `except:` clauses.
- **Global State:** Avoid mutable global state. Module-level constants are okay and should be `ALL_CAPS_WITH_UNDERSCORES`.
- **Comprehensions:** Use for simple cases. Avoid for complex logic where a full loop is more readable.
- **Default Argument Values:** Do not use mutable objects (like `[]` or `{}`) as default values.
- **True/False Evaluations:** Use implicit false (e.g., `if not my_list:`). Use `if foo is None:` to check for `None`.
- **Type Annotations:** Strongly encouraged for all public APIs.

### Python 3.12+ Modern Patterns

#### Structural Pattern Matching (PEP 634)

Use `match/case` for complex conditional logic:

```python
def process_command(command):
    match command:
        case ["quit"]:
            return "Exiting..."
        case ["load", filename]:
            return f"Loading {filename}"
        case ["save", filename, mode]:
            return f"Saving {filename} in {mode} mode"
        case _:
            return "Unknown command"
```

#### Type Parameter Syntax (PEP 695)

Use modern generic type syntax:

```python
# Old way (pre-3.12)
from typing import TypeVar, Generic
T = TypeVar('T')
class Stack(Generic[T]):
    ...

# New way (3.12+)
type Point = tuple[float, float]
type Vector[T] = list[T]

class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()
```

#### Union Types with `|` (PEP 604)

Use `|` operator for union types (available in 3.10+, standard in 3.12+):

```python
# Old way
from typing import Union, Optional
def process(value: Union[int, str]) -> Optional[str]:
    ...

# New way
def process(value: int | str) -> str | None:
    if isinstance(value, int):
        return str(value)
    return value
```

## 2. Python Style Rules

- **Line Length:** Maximum 88 characters (Black/Ruff default, more practical than 80).
- **Indentation:** 4 spaces per indentation level. Never use tabs.
- **Blank Lines:** Two blank lines between top-level definitions (classes, functions). One blank line between method definitions.
- **Whitespace:** Avoid extraneous whitespace. Surround binary operators with single spaces.
- **Docstrings:** Use `"""triple double quotes"""`. Every public module, function, class, and method must have a docstring.
  - **Format:** Google-style docstrings are the standard.
- **Strings:** Use f-strings for formatting. Be consistent with single (`'`) or double (`"`) quotes.
- **`TODO` Comments:** Use `TODO(username): Fix this.` format.
- **Imports Formatting:** Imports should be on separate lines and grouped: standard library, third-party, and your own application's imports.

### Google-Style Docstrings (Standard)

Google-style is the recommended docstring format:

```python
def fetch_bigtable_rows(big_table, keys, other_silly_variable=None):
    """Fetches rows from a Bigtable.

    Retrieves rows pertaining to the given keys from the Table instance
    represented by big_table. Silly things may happen if other_silly_variable
    is not None.

    Args:
        big_table: An open Bigtable Table instance.
        keys: A sequence of strings representing the key of each table row
            to fetch.
        other_silly_variable: Another optional variable, that has a much
            longer name than the other args, and which does nothing.

    Returns:
        A dict mapping keys to the corresponding table row data
        fetched. Each row is represented as a tuple of strings. For
        example:

        {'Serak': ('Rigel VII', 'Preparer'),
         'Zim': ('Irk', 'Invader'),
         'Lrrr': ('Omicron Persei 8', 'Emperor')}

        If a key from the keys argument is missing from the dictionary,
        then that row was not found in the table.

    Raises:
        IOError: An error occurred accessing the bigtable.Table object.
    """
    pass
```

## 3. Naming

- **General:** `snake_case` for modules, functions, methods, and variables.
- **Classes:** `PascalCase`.
- **Constants:** `ALL_CAPS_WITH_UNDERSCORES`.
- **Internal Use:** Use a single leading underscore (`_internal_variable`) for internal module/class members.

## 4. Main

- All executable files should have a `main()` function that contains the main logic, called from a `if __name__ == '__main__':` block.

```python
def main() -> None:
    """Main entry point."""
    # Main logic here
    pass

if __name__ == '__main__':
    main()
```

## 5. Modern Tools

### Ruff (Recommended Linter)

Ruff is a fast, modern linter that replaces flake8, pylint, and many plugins:

```bash
# Install
pip install ruff

# Run linter
ruff check .

# Auto-fix issues
ruff check --fix .

# Format code (replaces Black)
ruff format .
```

**Configuration** (`.ruff.toml` or `pyproject.toml`):

```toml
[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # pyflakes
    "I",   # isort
    "B",   # flake8-bugbear
    "C4",  # flake8-comprehensions
    "UP",  # pyupgrade
]
```

### uv (Recommended Package Manager)

`uv` is a fast Python package installer and resolver (10-100x faster than pip):

```bash
# Install uv
pip install uv

# Create virtual environment
uv venv

# Install dependencies
uv pip install -r requirements.txt

# Add a package
uv pip install requests

# Sync dependencies (from pyproject.toml)
uv pip sync
```

**Benefits:**

- Blazing fast (written in Rust)
- Reliable dependency resolution
- Compatible with pip and virtualenv
- Handles dependency conflicts better

## 6. Type Hints (Python 3.12+)

### Use Modern Syntax

```python
# Function annotations
def greet(name: str) -> str:
    return f"Hello, {name}"

# Union types
def process(value: int | str | None) -> str:
    match value:
        case None:
            return "No value"
        case int():
            return f"Number: {value}"
        case str():
            return f"String: {value}"

# Generics
class Container[T]:
    def __init__(self, value: T) -> None:
        self.value = value

    def get(self) -> T:
        return self.value

# Type aliases
type UserId = int
type UserName = str
type User = dict[str, UserId | UserName]
```

## 7. Pattern Matching Examples

### Complex Data Structures

```python
def analyze_json(data: dict) -> str:
    match data:
        case {"type": "user", "id": user_id, "name": name}:
            return f"User {name} (ID: {user_id})"
        case {"type": "post", "id": post_id, "title": title}:
            return f"Post: {title}"
        case {"type": "comment", "text": text, "author": author}:
            return f"Comment by {author}: {text}"
        case _:
            return "Unknown data type"
```

### Guard Clauses

```python
def process_point(point):
    match point:
        case (x, y) if x == y:
            return f"Diagonal point: ({x}, {y})"
        case (0, y):
            return f"Y-axis point: {y}"
        case (x, 0):
            return f"X-axis point: {x}"
        case (x, y):
            return f"Point: ({x}, {y})"
```

**BE CONSISTENT.** When editing code, match the existing style.

## Quick Reference Card

| Feature               | Modern (3.12+)                 | Legacy                          |
| --------------------- | ------------------------------ | ------------------------------- |
| **Linter**            | `ruff`                         | `flake8`, `pylint`              |
| **Package Manager**   | `uv`                           | `pip`, `poetry`                 |
| **Union Types**       | `int \| str`                   | `Union[int, str]`               |
| **Optional**          | `str \| None`                  | `Optional[str]`                 |
| **Type Aliases**      | `type Point = tuple[int, int]` | `Point = Tuple[int, int]`       |
| **Generics**          | `class Stack[T]: ...`          | `class Stack(Generic[T]): ...`  |
| **Docstrings**        | Google-style                   | Google-style (no change)        |
| **String Formatting** | f-strings                      | f-strings (available since 3.6) |
| **Pattern Matching**  | `match/case`                   | `if/elif/else` chains           |
| **Line Length**       | 88 chars (Ruff/Black)          | 80 chars (Google)               |

---

_Sources:_

- _[Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)_
- _[PEP 634 – Structural Pattern Matching](https://peps.python.org/pep-0634/)_
- _[PEP 695 – Type Parameter Syntax](https://peps.python.org/pep-0695/)_
- _[PEP 604 – Union Types with |](https://peps.python.org/pep-0604/)_
- _[Ruff Documentation](https://docs.astral.sh/ruff/)_
- _[uv Documentation](https://github.com/astral-sh/uv)_
