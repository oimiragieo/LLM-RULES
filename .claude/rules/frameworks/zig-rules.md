# Zig Systems Programming Standards

Rules for writing correct, performant Zig code following community conventions and safety best practices.

## Memory Management

- Always use an allocator parameter — never use a global allocator in library code
- Use `defer allocator.free(memory)` immediately after allocation to prevent leaks
- Prefer stack allocation for small, fixed-size data; use allocator for heap
- Use `ArrayList(T)`, `HashMap`, `StringHashMap` from `std.ArrayList` — don't roll your own
- Test with `std.testing.allocator` in tests — it detects leaks and double-frees

```zig
// GOOD: Allocator as parameter, defer for cleanup
fn processData(allocator: std.mem.Allocator, input: []const u8) ![]u8 {
    const buffer = try allocator.alloc(u8, input.len * 2);
    defer allocator.free(buffer);  // Set defer IMMEDIATELY after alloc

    // ... process ...
    const result = try allocator.dupe(u8, buffer[0..processed_len]);
    return result;  // Caller owns this memory
}

// ArrayList usage
var list = std.ArrayList(u32).init(allocator);
defer list.deinit();
try list.append(42);
try list.appendSlice(&[_]u32{ 1, 2, 3 });
```

## Error Handling

- Use `!T` return type for fallible functions — never return sentinel values for errors
- Use `try` for propagating errors up the call stack (equivalent to `catch |err| return err`)
- Use `catch` to handle specific errors and provide fallback behavior
- Define error sets with `const MyError = error { ... }` for domain-specific errors
- Use `errdefer` for cleanup that should only run on the error path

```zig
const FileError = error{
    NotFound,
    PermissionDenied,
    InvalidFormat,
};

fn parseConfig(path: []const u8) FileError!Config {
    const file = std.fs.cwd().openFile(path, .{}) catch |err| switch (err) {
        error.FileNotFound     => return FileError.NotFound,
        error.AccessDenied     => return FileError.PermissionDenied,
        else                   => return err,
    };
    defer file.close();

    // errdefer: only runs if function returns an error
    const content = try file.readToEndAlloc(allocator, 1_000_000);
    errdefer allocator.free(content);  // Free only if parsing fails below

    return parseJson(content) catch FileError.InvalidFormat;
}
```

## Comptime and Generics

```zig
// Comptime generic function — zero runtime overhead
fn max(comptime T: type, a: T, b: T) T {
    return if (a > b) a else b;
}

// Comptime interface pattern (duck typing)
fn printAny(value: anytype) void {
    const T = @TypeOf(value);
    switch (@typeInfo(T)) {
        .Int, .Float  => std.debug.print("{d}", .{value}),
        .Bool         => std.debug.print("{}", .{value}),
        .Pointer      => std.debug.print("{s}", .{value}),
        else          => std.debug.print("[{}]", .{T}),
    }
}

// Comptime struct generation
fn Result(comptime T: type) type {
    return union(enum) {
        ok:  T,
        err: []const u8,

        pub fn unwrap(self: @This()) T {
            return switch (self) {
                .ok  => |v| v,
                .err => |msg| @panic(msg),
            };
        }
    };
}
```

## Slices and Pointers

- Use slices (`[]T`, `[]const T`) over raw pointers — they carry length information
- Use `*T` for single mutable values, `*const T` for single immutable values
- Use `[*]T` (many-item pointer) only when interfacing with C code
- Never use `@ptrCast` without careful justification — it bypasses the type system
- Mark immutable data as `const` at every level: `[]const u8` for string literals

```zig
// String handling — always []const u8 for string literals
const greeting: []const u8 = "Hello, World!";

// Slice from array
var buffer: [256]u8 = undefined;
const slice = buffer[0..128];  // slice: []u8 (mutable, 128 elements)

// C interop — null-terminated string
const c_str: [*:0]const u8 = "C string";
```

## Testing

```zig
// Standard test pattern
test "max returns larger value" {
    try std.testing.expectEqual(@as(i32, 5), max(i32, 3, 5));
    try std.testing.expectEqual(@as(i32, 7), max(i32, 7, 2));
}

test "parseConfig handles missing file" {
    const result = parseConfig("/nonexistent/file.json");
    try std.testing.expectError(FileError.NotFound, result);
}

// Test with allocator (detects leaks)
test "processData allocates and returns" {
    const allocator = std.testing.allocator;
    const result = try processData(allocator, "input");
    defer allocator.free(result);
    try std.testing.expect(result.len > 0);
}
```

## Build System (build.zig)

```zig
pub fn build(b: *std.Build) void {
    const target   = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const lib = b.addStaticLibrary(.{
        .name    = "mylib",
        .root_source_file = b.path("src/root.zig"),
        .target  = target,
        .optimize = optimize,
    });

    b.installArtifact(lib);

    // Tests
    const unit_tests = b.addTest(.{
        .root_source_file = b.path("src/root.zig"),
        .target  = target,
        .optimize = optimize,
    });
    const run_tests = b.addRunArtifact(unit_tests);
    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_tests.step);
}
```

## Anti-Patterns (NEVER)

- Never use `undefined` for a value that will be read before being set — use explicit initialization
- Never ignore error returns — `_ = fallibleFn()` is not acceptable for functions that can fail
- Never use `@intToPtr` / `@ptrToInt` for general pointer manipulation — use slices
- Never allocate inside a loop without freeing in the same iteration or using an arena allocator
- Never use `@panic` for expected/recoverable errors — return an error union instead

## When to Invoke

Apply these rules for any Zig module. For embedded/systems work, also apply `iot-engineer` agent patterns.
