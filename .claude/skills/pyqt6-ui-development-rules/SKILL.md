---
name: pyqt6-ui-development-rules
description: PyQt6 desktop GUI development rules -- signal/slot architecture, QSS theming, QThread concurrency, layout management, and cross-platform rendering. Enforces MVC separation and responsive UI patterns.
version: 2.0.0
category: Languages
agents: [python-pro, developer]
tags: [pyqt6, python, gui, desktop, qt, ui, signals-slots, qss, qthread]
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
globs: ['**/gui/**/*.*', '**/*_ui.py', '**/*_dialog.py', '**/*_window.py']
best_practices:
  - Use Qt signal/slot mechanism for all UI-to-logic communication
  - Never block the main thread with long-running operations
  - Apply QSS stylesheets at the QApplication level for consistent theming
  - Use layout managers instead of absolute pixel coordinates
  - Test on all target platforms before release
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-03-01'
---

# PyQt6 UI Development Rules Skill

<identity>
PyQt6 desktop GUI development specialist enforcing MVC separation, signal/slot architecture, QSS theming, threaded concurrency, and cross-platform rendering best practices. Ensures responsive, accessible, and visually consistent desktop applications.
</identity>

<capabilities>
- Design MVC-separated PyQt6 application architecture
- Implement signal/slot communication patterns between UI and business logic
- Configure QSS application-level theming with dark/light mode support
- Manage background operations with QThread, QRunnable, and QThreadPool
- Build responsive layouts using QVBoxLayout, QHBoxLayout, QGridLayout, and QFormLayout
- Implement custom QWidget subclasses with proper paintEvent handling
- Set up cross-platform DPI-aware rendering
- Configure accessibility features (screen reader support, keyboard navigation)
</capabilities>

## Overview

This skill enforces rules for building production-quality PyQt6 desktop applications. The core principles are: strict MVC separation via signals/slots, never blocking the UI thread, centralized theming via QSS, and layout-manager-driven responsive design. These rules prevent the most common PyQt6 failures: frozen UIs, untestable coupling, and platform-specific rendering bugs.

## When to Use

- When building new PyQt6 desktop applications
- When refactoring existing PyQt/PySide code to PyQt6
- When debugging frozen or unresponsive Qt UIs
- When implementing custom widgets or complex layouts
- When setting up cross-platform desktop application builds

## Iron Laws

1. **ALWAYS** use Qt's signal/slot mechanism for UI-to-logic communication -- direct method calls between UI and business logic layers break MVC separation and cause untestable coupling.
2. **NEVER** perform long-running operations on the main UI thread -- blocking the Qt event loop makes the interface unresponsive and triggers OS "not responding" dialogs.
3. **ALWAYS** apply QSS stylesheets at the QApplication level rather than per-widget -- per-widget inline styles create inconsistent themes and unmaintainable styling sprawl.
4. **NEVER** use absolute pixel coordinates for widget layout -- use Qt layout managers (QVBoxLayout, QHBoxLayout, QGridLayout) to ensure DPI-aware and cross-platform rendering.
5. **ALWAYS** test the UI on all target platforms before release -- PyQt6 rendering, font scaling, and widget sizing differ between Windows, macOS, and Linux.

## Anti-Patterns

| Anti-Pattern                                   | Why It Fails                                                                      | Correct Approach                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Calling business logic directly from UI slots  | Couples UI to logic; makes testing impossible and breaks MVC architecture         | Emit signals from UI; connect to controller/service methods via slot                  |
| Running network or file I/O on the main thread | Blocks the Qt event loop; UI freezes until operation completes                    | Use QThread, QRunnable, or asyncio with qasync for background operations              |
| Hardcoding pixel sizes and positions           | Breaks on high-DPI displays and different OS DPI scaling settings                 | Use layout managers and size policies; use `logicalDpiX()` for DPI-aware sizing       |
| Setting styles inline on individual widgets    | Creates visual inconsistency; extremely difficult to theme or maintain            | Define a single QSS stylesheet at QApplication level and use object names/classes     |
| Ignoring cross-platform rendering differences  | Widget sizes, fonts, and margins differ significantly between Windows/macOS/Linux | Test on all target platforms; use platform-conditional logic where rendering diverges |

## Workflow

### Step 1: Application Architecture (MVC)

```python
# model.py -- Business logic, no Qt dependencies
class DataModel:
    def __init__(self):
        self._items = []

    def add_item(self, item: str) -> bool:
        if item and item not in self._items:
            self._items.append(item)
            return True
        return False

# controller.py -- Mediates between Model and View
from PyQt6.QtCore import QObject, pyqtSignal

class Controller(QObject):
    items_changed = pyqtSignal(list)
    error_occurred = pyqtSignal(str)

    def __init__(self, model: DataModel):
        super().__init__()
        self._model = model

    def add_item(self, item: str) -> None:
        if self._model.add_item(item):
            self.items_changed.emit(self._model._items.copy())
        else:
            self.error_occurred.emit(f"Could not add: {item}")
```

### Step 2: Signal/Slot Wiring

```python
# view.py -- UI only, connects via signals/slots
from PyQt6.QtWidgets import QMainWindow, QVBoxLayout, QWidget, QLineEdit, QPushButton, QListWidget

class MainView(QMainWindow):
    def __init__(self, controller: Controller):
        super().__init__()
        self._controller = controller

        # Wire signals to slots
        self._controller.items_changed.connect(self._on_items_changed)
        self._controller.error_occurred.connect(self._on_error)

        # UI emits to controller -- never calls model directly
        self._add_btn.clicked.connect(lambda: self._controller.add_item(self._input.text()))

    def _on_items_changed(self, items: list) -> None:
        self._list.clear()
        self._list.addItems(items)
```

### Step 3: Background Operations

```python
from PyQt6.QtCore import QThread, pyqtSignal

class WorkerThread(QThread):
    progress = pyqtSignal(int)
    finished_with_result = pyqtSignal(object)
    error = pyqtSignal(str)

    def __init__(self, task_fn, parent=None):
        super().__init__(parent)
        self._task_fn = task_fn

    def run(self):
        try:
            result = self._task_fn(self.progress.emit)
            self.finished_with_result.emit(result)
        except Exception as e:
            self.error.emit(str(e))
```

### Step 4: QSS Theming

```python
# Apply at QApplication level
app = QApplication(sys.argv)
app.setStyleSheet(Path("styles/dark-theme.qss").read_text())

# QSS file
"""
QMainWindow {
    background-color: #2b2b2b;
    color: #e0e0e0;
}
QPushButton {
    background-color: #3c3f41;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 6px 16px;
    color: #e0e0e0;
}
QPushButton:hover {
    background-color: #4c5052;
}
"""
```

### Step 5: Layout Management

```python
# Use layout managers -- never setGeometry() or move()
layout = QVBoxLayout()
layout.addWidget(self._toolbar)
layout.addWidget(self._content, stretch=1)  # stretch fills available space
layout.addWidget(self._status_bar)

# For responsive grids
grid = QGridLayout()
grid.addWidget(label, 0, 0)
grid.addWidget(input_field, 0, 1)
grid.setColumnStretch(1, 1)  # input stretches, label stays fixed
```

## Complementary Skills

| Skill                   | Relationship                                            |
| ----------------------- | ------------------------------------------------------- |
| `modern-python`         | Project setup with uv, ruff, ty, pytest                 |
| `python-backend-expert` | Backend service patterns for desktop app backends       |
| `tdd`                   | Test-driven development for Qt widget testing           |
| `accessibility`         | Accessibility audit patterns applicable to desktop apps |

## Memory Protocol (MANDATORY)

**Before starting:**

Read `.claude/context/memory/learnings.md` for prior PyQt6 patterns and platform-specific workarounds.

**After completing:** Record any platform-specific rendering issues, signal/slot patterns, or QThread gotchas to `.claude/context/memory/learnings.md`.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
