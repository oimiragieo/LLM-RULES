> ## Documentation Index

> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt

> Use this file to discover all available pages before exploring further.

\# Run Claude Code programmatically

> Use the Agent SDK to run Claude Code programmatically from the CLI, Python, or TypeScript.

The \[Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) gives you the same tools, agent loop, and context management that power Claude Code. It's available as a CLI for scripts and CI/CD, or as \[Python](https://platform.claude.com/docs/en/agent-sdk/python) and \[TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript) packages for full programmatic control.

<Note>

&nbsp; The CLI was previously called "headless mode." The `-p` flag and all CLI options work the same way.

</Note>

To run Claude Code programmatically from the CLI, pass `-p` with your prompt and any \[CLI options](/en/cli-reference):

```bash theme={null}

claude -p "Find and fix the bug in auth.py" --allowedTools "Read,Edit,Bash"

```

This page covers using the Agent SDK via the CLI (`claude -p`). For the Python and TypeScript SDK packages with structured outputs, tool approval callbacks, and native message objects, see the \[full Agent SDK documentation](https://platform.claude.com/docs/en/agent-sdk/overview).

\## Basic usage

Add the `-p` (or `--print`) flag to any `claude` command to run it non-interactively. All \[CLI options](/en/cli-reference) work with `-p`, including:

\* `--continue` for \[continuing conversations](#continue-conversations)

\* `--allowedTools` for \[auto-approving tools](#auto-approve-tools)

\* `--output-format` for \[structured output](#get-structured-output)

This example asks Claude a question about your codebase and prints the response:

```bash theme={null}

claude -p "What does the auth module do?"

```

\## Examples

These examples highlight common CLI patterns.

\### Get structured output

Use `--output-format` to control how responses are returned:

\* `text` (default): plain text output

\* `json`: structured JSON with result, session ID, and metadata

\* `stream-json`: newline-delimited JSON for real-time streaming

This example returns a project summary as JSON with session metadata, with the text result in the `result` field:

```bash theme={null}

claude -p "Summarize this project" --output-format json

```

To get output conforming to a specific schema, use `--output-format json` with `--json-schema` and a \[JSON Schema](https://json-schema.org/) definition. The response includes metadata about the request (session ID, usage, etc.) with the structured output in the `structured\_output` field.

This example extracts function names and returns them as an array of strings:

```bash theme={null}

claude -p "Extract the main function names from auth.py" \\

&nbsp; --output-format json \\

&nbsp; --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":\["functions"]}'

```

<Tip>

&nbsp; Use a tool like \[jq](https://jqlang.github.io/jq/) to parse the response and extract specific fields:

&nbsp; ```bash theme={null}

&nbsp; # Extract the text result

&nbsp; claude -p "Summarize this project" --output-format json | jq -r '.result'

&nbsp; # Extract structured output

&nbsp; claude -p "Extract function names from auth.py" \\

&nbsp; --output-format json \\

&nbsp; --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":\["functions"]}' \\

&nbsp; | jq '.structured_output'

&nbsp; ```

</Tip>

\### Stream responses

Use `--output-format stream-json` with `--verbose` and `--include-partial-messages` to receive tokens as they're generated. Each line is a JSON object representing an event:

```bash theme={null}

claude -p "Explain recursion" --output-format stream-json --verbose --include-partial-messages

```

The following example uses \[jq](https://jqlang.github.io/jq/) to filter for text deltas and display just the streaming text. The `-r` flag outputs raw strings (no quotes) and `-j` joins without newlines so tokens stream continuously:

```bash theme={null}

claude -p "Write a poem" --output-format stream-json --verbose --include-partial-messages | \\

&nbsp; jq -rj 'select(.type == "stream\_event" and .event.delta.type? == "text\_delta") | .event.delta.text'

```

For programmatic streaming with callbacks and message objects, see \[Stream responses in real-time](https://platform.claude.com/docs/en/agent-sdk/streaming-output) in the Agent SDK documentation.

\### Auto-approve tools

Use `--allowedTools` to let Claude use certain tools without prompting. This example runs a test suite and fixes failures, allowing Claude to execute Bash commands and read/edit files without asking for permission:

```bash theme={null}

claude -p "Run the test suite and fix any failures" \\

&nbsp; --allowedTools "Bash,Read,Edit"

```

\### Create a commit

This example reviews staged changes and creates a commit with an appropriate message:

```bash theme={null}

claude -p "Look at my staged changes and create an appropriate commit" \\

&nbsp; --allowedTools "Bash(git diff \*),Bash(git log \*),Bash(git status \*),Bash(git commit \*)"

```

The `--allowedTools` flag uses \[permission rule syntax](/en/settings#permission-rule-syntax). The trailing ` \*` enables prefix matching, so `Bash(git diff \*)` allows any command starting with `git diff`. The space before `\*` is important: without it, `Bash(git diff\*)` would also match `git diff-index`.

<Note>

&nbsp; User-invoked \[skills](/en/skills) like `/commit` and \[built-in commands](/en/interactive-mode#built-in-commands) are only available in interactive mode. In `-p` mode, describe the task you want to accomplish instead.

</Note>

\### Customize the system prompt

Use `--append-system-prompt` to add instructions while keeping Claude Code's default behavior. This example pipes a PR diff to Claude and instructs it to review for security vulnerabilities:

```bash theme={null}

gh pr diff "$1" | claude -p \\

&nbsp; --append-system-prompt "You are a security engineer. Review for vulnerabilities." \\

&nbsp; --output-format json

```

See \[system prompt flags](/en/cli-reference#system-prompt-flags) for more options including `--system-prompt` to fully replace the default prompt.

\### Continue conversations

Use `--continue` to continue the most recent conversation, or `--resume` with a session ID to continue a specific conversation. This example runs a review, then sends follow-up prompts:

```bash theme={null}

\# First request

claude -p "Review this codebase for performance issues"



\# Continue the most recent conversation

claude -p "Now focus on the database queries" --continue

claude -p "Generate a summary of all issues found" --continue

```

If you're running multiple conversations, capture the session ID to resume a specific one:

```bash theme={null}

session\_id=$(claude -p "Start a review" --output-format json | jq -r '.session\_id')

claude -p "Continue that review" --resume "$session\_id"

```

\## Next steps

<CardGroup cols={2}>

&nbsp; <Card title="Agent SDK quickstart" icon="play" href="https://platform.claude.com/docs/en/agent-sdk/quickstart">

&nbsp; Build your first agent with Python or TypeScript

&nbsp; </Card>

&nbsp; <Card title="CLI reference" icon="terminal" href="/en/cli-reference">

&nbsp; Explore all CLI flags and options

&nbsp; </Card>

&nbsp; <Card title="GitHub Actions" icon="github" href="/en/github-actions">

&nbsp; Use the Agent SDK in GitHub workflows

&nbsp; </Card>

&nbsp; <Card title="GitLab CI/CD" icon="gitlab" href="/en/gitlab-ci-cd">

&nbsp; Use the Agent SDK in GitLab pipelines

&nbsp; </Card>

</CardGroup>
