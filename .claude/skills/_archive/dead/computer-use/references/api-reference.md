# Computer Use API Reference

## Tool Configuration

### Standard Configuration (Sonnet/Haiku)

```json
{
  "type": "computer_20250124",
  "name": "computer",
  "display_width_px": 1024,
  "display_height_px": 768,
  "display_number": 1
}
```

### Opus 4.5 Configuration

```json
{
  "type": "computer_20251124",
  "name": "computer",
  "display_width_px": 1024,
  "display_height_px": 768,
  "display_number": 1,
  "enable_zoom": true
}
```

## Beta Headers

| Model Version | Beta Header               |
| ------------- | ------------------------- |
| Sonnet, Haiku | `computer-use-2025-01-24` |
| Opus 4.5      | `computer-use-2025-11-24` |

## Actions Reference

### screenshot

Capture the current screen state.

```json
{
  "action": "screenshot"
}
```

**Returns**: Base64-encoded PNG image

---

### left_click

Click the left mouse button at a coordinate.

```json
{
  "action": "left_click",
  "coordinate": [500, 300]
}
```

| Parameter  | Type       | Required | Description           |
| ---------- | ---------- | -------- | --------------------- |
| coordinate | [int, int] | Yes      | [x, y] pixel position |

---

### right_click

Click the right mouse button at a coordinate.

```json
{
  "action": "right_click",
  "coordinate": [500, 300]
}
```

| Parameter  | Type       | Required | Description           |
| ---------- | ---------- | -------- | --------------------- |
| coordinate | [int, int] | Yes      | [x, y] pixel position |

---

### middle_click

Click the middle mouse button at a coordinate.

```json
{
  "action": "middle_click",
  "coordinate": [500, 300]
}
```

| Parameter  | Type       | Required | Description           |
| ---------- | ---------- | -------- | --------------------- |
| coordinate | [int, int] | Yes      | [x, y] pixel position |

---

### double_click

Double-click the left mouse button at a coordinate.

```json
{
  "action": "double_click",
  "coordinate": [500, 300]
}
```

| Parameter  | Type       | Required | Description           |
| ---------- | ---------- | -------- | --------------------- |
| coordinate | [int, int] | Yes      | [x, y] pixel position |

---

### triple_click

Triple-click the left mouse button at a coordinate (typically selects a line).

```json
{
  "action": "triple_click",
  "coordinate": [500, 300]
}
```

| Parameter  | Type       | Required | Description           |
| ---------- | ---------- | -------- | --------------------- |
| coordinate | [int, int] | Yes      | [x, y] pixel position |

---

### type

Type a string of text.

```json
{
  "action": "type",
  "text": "Hello, world!"
}
```

| Parameter | Type   | Required | Description  |
| --------- | ------ | -------- | ------------ |
| text      | string | Yes      | Text to type |

**Note**: Special characters are typed literally. For key combinations, use `key` action.

---

### key

Press a key or key combination.

```json
{
  "action": "key",
  "text": "ctrl+s"
}
```

| Parameter | Type   | Required | Description                                             |
| --------- | ------ | -------- | ------------------------------------------------------- |
| text      | string | Yes      | Key or combination (e.g., "enter", "ctrl+c", "alt+tab") |

**Common Keys**:

- Modifiers: `ctrl`, `alt`, `shift`, `super` (Windows/Cmd key)
- Navigation: `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown`
- Function: `f1` through `f12`
- Special: `enter`, `return`, `tab`, `escape`, `backspace`, `delete`, `space`

**Combinations**: Use `+` to combine keys: `ctrl+shift+s`, `alt+f4`

---

### mouse_move

Move the mouse cursor to a coordinate without clicking.

```json
{
  "action": "mouse_move",
  "coordinate": [500, 300]
}
```

| Parameter  | Type       | Required | Description           |
| ---------- | ---------- | -------- | --------------------- |
| coordinate | [int, int] | Yes      | [x, y] pixel position |

---

### scroll

Scroll the view at a coordinate.

```json
{
  "action": "scroll",
  "coordinate": [500, 400],
  "scroll_direction": "down",
  "scroll_amount": 3
}
```

| Parameter        | Type       | Required | Description                   |
| ---------------- | ---------- | -------- | ----------------------------- |
| coordinate       | [int, int] | Yes      | [x, y] scroll position        |
| scroll_direction | string     | Yes      | "up", "down", "left", "right" |
| scroll_amount    | int        | Yes      | Number of scroll units        |

---

### left_click_drag

Click and drag from one coordinate to another.

```json
{
  "action": "left_click_drag",
  "start_coordinate": [100, 100],
  "coordinate": [300, 300]
}
```

| Parameter        | Type       | Required | Description              |
| ---------------- | ---------- | -------- | ------------------------ |
| start_coordinate | [int, int] | Yes      | Starting [x, y] position |
| coordinate       | [int, int] | Yes      | Ending [x, y] position   |

---

### left_mouse_down

Press and hold the left mouse button at a coordinate.

```json
{
  "action": "left_mouse_down",
  "coordinate": [500, 300]
}
```

| Parameter  | Type       | Required | Description           |
| ---------- | ---------- | -------- | --------------------- |
| coordinate | [int, int] | Yes      | [x, y] pixel position |

**Note**: Must be followed by `left_mouse_up` to release.

---

### left_mouse_up

Release the left mouse button at a coordinate.

```json
{
  "action": "left_mouse_up",
  "coordinate": [500, 300]
}
```

| Parameter  | Type       | Required | Description           |
| ---------- | ---------- | -------- | --------------------- |
| coordinate | [int, int] | Yes      | [x, y] pixel position |

---

### hold_key

Hold a key for a specified duration.

```json
{
  "action": "hold_key",
  "text": "shift",
  "duration": 1.0
}
```

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| text      | string | Yes      | Key to hold             |
| duration  | float  | Yes      | Seconds to hold the key |

---

### wait

Wait for a specified duration.

```json
{
  "action": "wait",
  "duration": 2.0
}
```

| Parameter | Type  | Required | Description     |
| --------- | ----- | -------- | --------------- |
| duration  | float | Yes      | Seconds to wait |

---

### zoom (Opus 4.5 only)

Zoom in or out at a coordinate. Requires `enable_zoom: true` in tool config.

```json
{
  "action": "zoom",
  "coordinate": [500, 300],
  "zoom_direction": "in",
  "zoom_amount": 2
}
```

| Parameter      | Type       | Required | Description        |
| -------------- | ---------- | -------- | ------------------ |
| coordinate     | [int, int] | Yes      | [x, y] zoom center |
| zoom_direction | string     | Yes      | "in" or "out"      |
| zoom_amount    | int        | Yes      | Zoom level units   |

---

## Response Format

### Tool Result with Screenshot

Always return a screenshot after executing an action:

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_abc123",
  "content": [
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/png",
        "data": "<base64-encoded-png>"
      }
    }
  ]
}
```

### Error Response

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_abc123",
  "is_error": true,
  "content": "Error message describing what went wrong"
}
```

## Resolution Guidelines

| Resolution | Aspect Ratio | Use Case             | Accuracy |
| ---------- | ------------ | -------------------- | -------- |
| 1024x768   | 4:3          | Default, general use | Best     |
| 1280x800   | 16:10        | Wide content         | Good     |
| 1366x768   | ~16:9        | Common laptops       | Good     |
| 1920x1080  | 16:9         | High detail needed   | Fair     |

**Recommendation**: Start with 1024x768 and only increase if task requires it.

## Coordinate System

- Origin (0, 0) is at top-left corner
- X increases to the right
- Y increases downward
- Maximum values: (display_width_px - 1, display_height_px - 1)

```
(0,0) -------- X --------> (width-1, 0)
  |
  |
  Y
  |
  v
(0, height-1)           (width-1, height-1)
```

## Common Patterns

### Click and Type

```javascript
// Click a text field, then type
[
  { action: 'left_click', coordinate: [300, 200] },
  { action: 'type', text: 'username@example.com' },
];
```

### Select All and Copy

```javascript
[
  { action: 'key', text: 'ctrl+a' },
  { action: 'key', text: 'ctrl+c' },
];
```

### Scroll to Find Element

```javascript
[
  { action: 'scroll', coordinate: [512, 400], scroll_direction: 'down', scroll_amount: 5 },
  { action: 'wait', duration: 0.5 },
  { action: 'screenshot' },
];
```

### Drag and Drop

```javascript
[{ action: 'left_click_drag', start_coordinate: [100, 100], coordinate: [400, 400] }];
```

## API Endpoint Examples

### Node.js

```javascript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  tools: [
    {
      type: 'computer_20250124',
      name: 'computer',
      display_width_px: 1024,
      display_height_px: 768,
      display_number: 1,
    },
  ],
  messages: [{ role: 'user', content: 'Click the submit button' }],
  betas: ['computer-use-2025-01-24'],
});
```

### Python

```python
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    tools=[{
        "type": "computer_20250124",
        "name": "computer",
        "display_width_px": 1024,
        "display_height_px": 768,
        "display_number": 1
    }],
    messages=[{"role": "user", "content": "Click the submit button"}],
    betas=["computer-use-2025-01-24"]
)
```

### cURL

```bash
curl https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: computer-use-2025-01-24" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4096,
    "tools": [{
      "type": "computer_20250124",
      "name": "computer",
      "display_width_px": 1024,
      "display_height_px": 768,
      "display_number": 1
    }],
    "messages": [{"role": "user", "content": "Take a screenshot"}]
  }'
```
