> ## Documentation Index

> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt

> Use this file to discover all available pages before exploring further.

\# Connect Claude Code to tools via MCP

> Learn how to connect Claude Code to your tools with the Model Context Protocol.

export const MCPServersTable = ({platform = "all"}) => {

&nbsp; const ifYouAreAnAiAgentReadingThisYouShouldInsteadFetch = 'https://api.anthropic.com/mcp-registry/docs';

&nbsp; const \[servers, setServers] = useState(\[]);

&nbsp; const \[loading, setLoading] = useState(true);

&nbsp; const \[error, setError] = useState(null);

&nbsp; useEffect(() => {

&nbsp; const fetchServers = async () => {

&nbsp; try {

&nbsp; setLoading(true);

&nbsp; const allServers = \[];

&nbsp; let cursor = null;

&nbsp; do {

&nbsp; const url = new URL('https://api.anthropic.com/mcp-registry/v0/servers');

&nbsp; url.searchParams.set('version', 'latest');

&nbsp; url.searchParams.set('visibility', 'commercial');

&nbsp; url.searchParams.set('limit', '100');

&nbsp; if (cursor) {

&nbsp; url.searchParams.set('cursor', cursor);

&nbsp; }

&nbsp; const response = await fetch(url);

&nbsp; if (!response.ok) {

&nbsp; throw new Error(`Failed to fetch MCP registry: ${response.status}`);

&nbsp; }

&nbsp; const data = await response.json();

&nbsp; allServers.push(...data.servers);

&nbsp; cursor = data.metadata?.nextCursor || null;

&nbsp; } while (cursor);

&nbsp; const transformedServers = allServers.map(item => {

&nbsp; const server = item.server;

&nbsp; const meta = item.\_meta?.\['com.anthropic.api/mcp-registry'] || ({});

&nbsp; const worksWith = meta.worksWith || \[];

&nbsp; const availability = {

&nbsp; claudeCode: worksWith.includes('claude-code'),

&nbsp; mcpConnector: worksWith.includes('claude-api'),

&nbsp; claudeDesktop: worksWith.includes('claude-desktop')

&nbsp; };

&nbsp; const remotes = server.remotes || \[];

&nbsp; const httpRemote = remotes.find(r => r.type === 'streamable-http');

&nbsp; const sseRemote = remotes.find(r => r.type === 'sse');

&nbsp; const preferredRemote = httpRemote || sseRemote;

&nbsp; const remoteUrl = preferredRemote?.url || meta.url;

&nbsp; const remoteType = preferredRemote?.type;

&nbsp; const isTemplatedUrl = remoteUrl?.includes('{');

&nbsp; let setupUrl;

&nbsp; if (isTemplatedUrl \&\& meta.requiredFields) {

&nbsp; const urlField = meta.requiredFields.find(f => f.field === 'url');

&nbsp; setupUrl = urlField?.sourceUrl || meta.documentation;

&nbsp; }

&nbsp; const urls = {};

&nbsp; if (!isTemplatedUrl) {

&nbsp; if (remoteType === 'streamable-http') {

&nbsp; urls.http = remoteUrl;

&nbsp; } else if (remoteType === 'sse') {

&nbsp; urls.sse = remoteUrl;

&nbsp; }

&nbsp; }

&nbsp; let envVars = \[];

&nbsp; if (server.packages \&\& server.packages.length > 0) {

&nbsp; const npmPackage = server.packages.find(p => p.registryType === 'npm');

&nbsp; if (npmPackage) {

&nbsp; urls.stdio = `npx -y ${npmPackage.identifier}`;

&nbsp; if (npmPackage.environmentVariables) {

&nbsp; envVars = npmPackage.environmentVariables;

&nbsp; }

&nbsp; }

&nbsp; }

&nbsp; return {

&nbsp; name: meta.displayName || server.title || server.name,

&nbsp; description: meta.oneLiner || server.description,

&nbsp; documentation: meta.documentation,

&nbsp; urls: urls,

&nbsp; envVars: envVars,

&nbsp; availability: availability,

&nbsp; customCommands: meta.claudeCodeCopyText ? {

&nbsp; claudeCode: meta.claudeCodeCopyText

&nbsp; } : undefined,

&nbsp; setupUrl: setupUrl

&nbsp; };

&nbsp; });

&nbsp; setServers(transformedServers);

&nbsp; setError(null);

&nbsp; } catch (err) {

&nbsp; setError(err.message);

&nbsp; console.error('Error fetching MCP registry:', err);

&nbsp; } finally {

&nbsp; setLoading(false);

&nbsp; }

&nbsp; };

&nbsp; fetchServers();

&nbsp; }, \[]);

&nbsp; const generateClaudeCodeCommand = server => {

&nbsp; if (server.customCommands \&\& server.customCommands.claudeCode) {

&nbsp; return server.customCommands.claudeCode;

&nbsp; }

&nbsp; const serverSlug = server.name.toLowerCase().replace(/\[^a-z0-9]/g, '-');

&nbsp; if (server.urls.http) {

&nbsp; return `claude mcp add ${serverSlug} --transport http ${server.urls.http}`;

&nbsp; }

&nbsp; if (server.urls.sse) {

&nbsp; return `claude mcp add ${serverSlug} --transport sse ${server.urls.sse}`;

&nbsp; }

&nbsp; if (server.urls.stdio) {

&nbsp; const envFlags = server.envVars \&\& server.envVars.length > 0 ? server.envVars.map(v => `--env ${v.name}=YOUR\_${v.name}`).join(' ') : '';

&nbsp; const baseCommand = `claude mcp add ${serverSlug} --transport stdio`;

&nbsp; return envFlags ? `${baseCommand} ${envFlags} -- ${server.urls.stdio}` : `${baseCommand} -- ${server.urls.stdio}`;

&nbsp; }

&nbsp; return null;

&nbsp; };

&nbsp; if (loading) {

&nbsp; return <div>Loading MCP servers...</div>;

&nbsp; }

&nbsp; if (error) {

&nbsp; return <div>Error loading MCP servers: {error}</div>;

&nbsp; }

&nbsp; const filteredServers = servers.filter(server => {

&nbsp; if (platform === "claudeCode") {

&nbsp; return server.availability.claudeCode;

&nbsp; } else if (platform === "mcpConnector") {

&nbsp; return server.availability.mcpConnector;

&nbsp; } else if (platform === "claudeDesktop") {

&nbsp; return server.availability.claudeDesktop;

&nbsp; } else if (platform === "all") {

&nbsp; return true;

&nbsp; } else {

&nbsp; throw new Error(`Unknown platform: ${platform}`);

&nbsp; }

&nbsp; });

&nbsp; return <>

&nbsp; <style jsx>{`

&nbsp; .cards-container {

&nbsp; display: grid;

&nbsp; gap: 1rem;

&nbsp; margin-bottom: 2rem;

&nbsp; }

&nbsp; .server-card {

&nbsp; border: 1px solid var(--border-color, #e5e7eb);

&nbsp; border-radius: 6px;

&nbsp; padding: 1rem;

&nbsp; }

&nbsp; .command-row {

&nbsp; display: flex;

&nbsp; align-items: center;

&nbsp; gap: 0.25rem;

&nbsp; }

&nbsp; .command-row code {

&nbsp; font-size: 0.75rem;

&nbsp; overflow-x: auto;

&nbsp; }

&nbsp; `}</style>

&nbsp; <div className="cards-container">

&nbsp; {filteredServers.map(server => {

&nbsp; const claudeCodeCommand = generateClaudeCodeCommand(server);

&nbsp; const mcpUrl = server.urls.http || server.urls.sse;

&nbsp; const commandToShow = platform === "claudeCode" ? claudeCodeCommand : mcpUrl;

&nbsp; return <div key={server.name} className="server-card">

&nbsp; <div>

&nbsp; {server.documentation ? <a href={server.documentation}>

&nbsp; <strong>{server.name}</strong>

&nbsp; </a> : <strong>{server.name}</strong>}

&nbsp; </div>

&nbsp; <p style={{

&nbsp; margin: '0.5rem 0',

&nbsp; fontSize: '0.9rem'

&nbsp; }}>

&nbsp; {server.description}

&nbsp; </p>

&nbsp; {server.setupUrl \&\& <p style={{

&nbsp; margin: '0.25rem 0',

&nbsp; fontSize: '0.8rem',

&nbsp; fontStyle: 'italic',

&nbsp; opacity: 0.7

&nbsp; }}>

&nbsp; Requires user-specific URL.{' '}

&nbsp; <a href={server.setupUrl} style={{

&nbsp; textDecoration: 'underline'

&nbsp; }}>

&nbsp; Get your URL here

&nbsp; </a>.

&nbsp; </p>}

&nbsp; {commandToShow \&\& !server.setupUrl \&\& <>

&nbsp; <p style={{

&nbsp; display: 'block',

&nbsp; fontSize: '0.75rem',

&nbsp; fontWeight: 500,

&nbsp; minWidth: 'fit-content',

&nbsp; marginTop: '0.5rem',

&nbsp; marginBottom: 0

&nbsp; }}>

&nbsp; {platform === "claudeCode" ? "Command" : "URL"}

&nbsp; </p>

&nbsp; <div className="command-row">

&nbsp; <code>

&nbsp; {commandToShow}

&nbsp; </code>

&nbsp; </div>

&nbsp; </>}

&nbsp; </div>;

&nbsp; })}

&nbsp; </div>

&nbsp; </>;

};

Claude Code can connect to hundreds of external tools and data sources through the \[Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction), an open source standard for AI-tool integrations. MCP servers give Claude Code access to your tools, databases, and APIs.

\## What you can do with MCP

With MCP servers connected, you can ask Claude Code to:

\* \*\*Implement features from issue trackers\*\*: "Add the feature described in JIRA issue ENG-4521 and create a PR on GitHub."

\* \*\*Analyze monitoring data\*\*: "Check Sentry and Statsig to check the usage of the feature described in ENG-4521."

\* \*\*Query databases\*\*: "Find emails of 10 random users who used feature ENG-4521, based on our PostgreSQL database."

\* \*\*Integrate designs\*\*: "Update our standard email template based on the new Figma designs that were posted in Slack"

\* \*\*Automate workflows\*\*: "Create Gmail drafts inviting these 10 users to a feedback session about the new feature."

\## Popular MCP servers

Here are some commonly used MCP servers you can connect to Claude Code:

<Warning>

&nbsp; Use third party MCP servers at your own risk - Anthropic has not verified

&nbsp; the correctness or security of all these servers.

&nbsp; Make sure you trust MCP servers you are installing.

&nbsp; Be especially careful when using MCP servers that could fetch untrusted

&nbsp; content, as these can expose you to prompt injection risk.

</Warning>

<MCPServersTable platform="claudeCode" />

<Note>

&nbsp; \*\*Need a specific integration?\*\* \[Find hundreds more MCP servers on GitHub](https://github.com/modelcontextprotocol/servers), or build your own using the \[MCP SDK](https://modelcontextprotocol.io/quickstart/server).

</Note>

\## Installing MCP servers

MCP servers can be configured in three different ways depending on your needs:

\### Option 1: Add a remote HTTP server

HTTP servers are the recommended option for connecting to remote MCP servers. This is the most widely supported transport for cloud-based services.

```bash theme={null}

\# Basic syntax

claude mcp add --transport http <name> <url>



\# Real example: Connect to Notion

claude mcp add --transport http notion https://mcp.notion.com/mcp



\# Example with Bearer token

claude mcp add --transport http secure-api https://api.example.com/mcp \\

&nbsp; --header "Authorization: Bearer your-token"

```

\### Option 2: Add a remote SSE server

<Warning>

&nbsp; The SSE (Server-Sent Events) transport is deprecated. Use HTTP servers instead, where available.

</Warning>

```bash theme={null}

\# Basic syntax

claude mcp add --transport sse <name> <url>



\# Real example: Connect to Asana

claude mcp add --transport sse asana https://mcp.asana.com/sse



\# Example with authentication header

claude mcp add --transport sse private-api https://api.company.com/sse \\

&nbsp; --header "X-API-Key: your-key-here"

```

\### Option 3: Add a local stdio server

Stdio servers run as local processes on your machine. They're ideal for tools that need direct system access or custom scripts.

```bash theme={null}

\# Basic syntax

claude mcp add \[options] <name> -- <command> \[args...]



\# Real example: Add Airtable server

claude mcp add --transport stdio --env AIRTABLE\_API\_KEY=YOUR\_KEY airtable \\

&nbsp; -- npx -y airtable-mcp-server

```

<Note>

&nbsp; \*\*Important: Option ordering\*\*

&nbsp; All options (`--transport`, `--env`, `--scope`, `--header`) must come \*\*before\*\* the server name. The `--` (double dash) then separates the server name from the command and arguments that get passed to the MCP server.

&nbsp; For example:

&nbsp; \* `claude mcp add --transport stdio myserver -- npx server` → runs `npx server`

&nbsp; \* `claude mcp add --transport stdio --env KEY=value myserver -- python server.py --port 8080` → runs `python server.py --port 8080` with `KEY=value` in environment

&nbsp; This prevents conflicts between Claude's flags and the server's flags.

</Note>

\### Managing your servers

Once configured, you can manage your MCP servers with these commands:

```bash theme={null}

\# List all configured servers

claude mcp list



\# Get details for a specific server

claude mcp get github



\# Remove a server

claude mcp remove github



\# (within Claude Code) Check server status

/mcp

```

\### Dynamic tool updates

Claude Code supports MCP `list\_changed` notifications, allowing MCP servers to dynamically update their available tools, prompts, and resources without requiring you to disconnect and reconnect. When an MCP server sends a `list\_changed` notification, Claude Code automatically refreshes the available capabilities from that server.

<Tip>

&nbsp; Tips:

&nbsp; \* Use the `--scope` flag to specify where the configuration is stored:

&nbsp; \* `local` (default): Available only to you in the current project (was called `project` in older versions)

&nbsp; \* `project`: Shared with everyone in the project via `.mcp.json` file

&nbsp; \* `user`: Available to you across all projects (was called `global` in older versions)

&nbsp; \* Set environment variables with `--env` flags (for example, `--env KEY=value`)

&nbsp; \* Configure MCP server startup timeout using the MCP\\\_TIMEOUT environment variable (for example, `MCP\_TIMEOUT=10000 claude` sets a 10-second timeout)

&nbsp; \* Claude Code will display a warning when MCP tool output exceeds 10,000 tokens. To increase this limit, set the `MAX\_MCP\_OUTPUT\_TOKENS` environment variable (for example, `MAX\_MCP\_OUTPUT\_TOKENS=50000`)

&nbsp; \* Use `/mcp` to authenticate with remote servers that require OAuth 2.0 authentication

</Tip>

<Warning>

&nbsp; \*\*Windows Users\*\*: On native Windows (not WSL), local MCP servers that use `npx` require the `cmd /c` wrapper to ensure proper execution.

&nbsp; ```bash theme={null}

&nbsp; # This creates command="cmd" which Windows can execute

&nbsp; claude mcp add --transport stdio my-server -- cmd /c npx -y @some/package

&nbsp; ```

&nbsp; Without the `cmd /c` wrapper, you'll encounter "Connection closed" errors because Windows cannot directly execute `npx`. (See the note above for an explanation of the `--` parameter.)

</Warning>

\### Plugin-provided MCP servers

\[Plugins](/en/plugins) can bundle MCP servers, automatically providing tools and integrations when the plugin is enabled. Plugin MCP servers work identically to user-configured servers.

\*\*How plugin MCP servers work\*\*:

\* Plugins define MCP servers in `.mcp.json` at the plugin root or inline in `plugin.json`

\* When a plugin is enabled, its MCP servers start automatically

\* Plugin MCP tools appear alongside manually configured MCP tools

\* Plugin servers are managed through plugin installation (not `/mcp` commands)

\*\*Example plugin MCP configuration\*\*:

In `.mcp.json` at plugin root:

```json theme={null}

{

&nbsp; "database-tools": {

&nbsp;   "command": "${CLAUDE\_PLUGIN\_ROOT}/servers/db-server",

&nbsp;   "args": \["--config", "${CLAUDE\_PLUGIN\_ROOT}/config.json"],

&nbsp;   "env": {

&nbsp;     "DB\_URL": "${DB\_URL}"

&nbsp;   }

&nbsp; }

}

```

Or inline in `plugin.json`:

```json theme={null}

{

&nbsp; "name": "my-plugin",

&nbsp; "mcpServers": {

&nbsp;   "plugin-api": {

&nbsp;     "command": "${CLAUDE\_PLUGIN\_ROOT}/servers/api-server",

&nbsp;     "args": \["--port", "8080"]

&nbsp;   }

&nbsp; }

}

```

\*\*Plugin MCP features\*\*:

\* \*\*Automatic lifecycle\*\*: Servers start when plugin enables, but you must restart Claude Code to apply MCP server changes (enabling or disabling)

\* \*\*Environment variables\*\*: Use `${CLAUDE\_PLUGIN\_ROOT}` for plugin-relative paths

\* \*\*User environment access\*\*: Access to same environment variables as manually configured servers

\* \*\*Multiple transport types\*\*: Support stdio, SSE, and HTTP transports (transport support may vary by server)

\*\*Viewing plugin MCP servers\*\*:

```bash theme={null}

\# Within Claude Code, see all MCP servers including plugin ones

/mcp

```

Plugin servers appear in the list with indicators showing they come from plugins.

\*\*Benefits of plugin MCP servers\*\*:

\* \*\*Bundled distribution\*\*: Tools and servers packaged together

\* \*\*Automatic setup\*\*: No manual MCP configuration needed

\* \*\*Team consistency\*\*: Everyone gets the same tools when plugin is installed

See the \[plugin components reference](/en/plugins-reference#mcp-servers) for details on bundling MCP servers with plugins.

\## MCP installation scopes

MCP servers can be configured at three different scope levels, each serving distinct purposes for managing server accessibility and sharing. Understanding these scopes helps you determine the best way to configure servers for your specific needs.

\### Local scope

Local-scoped servers represent the default configuration level and are stored in `~/.claude.json` under your project's path. These servers remain private to you and are only accessible when working within the current project directory. This scope is ideal for personal development servers, experimental configurations, or servers containing sensitive credentials that shouldn't be shared.

<Note>

&nbsp; The term "local scope" for MCP servers differs from general local settings. MCP local-scoped servers are stored in `~/.claude.json` (your home directory), while general local settings use `.claude/settings.local.json` (in the project directory). See \[Settings](/en/settings#settings-files) for details on settings file locations.

</Note>

```bash theme={null}

\# Add a local-scoped server (default)

claude mcp add --transport http stripe https://mcp.stripe.com



\# Explicitly specify local scope

claude mcp add --transport http stripe --scope local https://mcp.stripe.com

```

\### Project scope

Project-scoped servers enable team collaboration by storing configurations in a `.mcp.json` file at your project's root directory. This file is designed to be checked into version control, ensuring all team members have access to the same MCP tools and services. When you add a project-scoped server, Claude Code automatically creates or updates this file with the appropriate configuration structure.

```bash theme={null}

\# Add a project-scoped server

claude mcp add --transport http paypal --scope project https://mcp.paypal.com/mcp

```

The resulting `.mcp.json` file follows a standardized format:

```json theme={null}

{

&nbsp; "mcpServers": {

&nbsp;   "shared-server": {

&nbsp;     "command": "/path/to/server",

&nbsp;     "args": \[],

&nbsp;     "env": {}

&nbsp;   }

&nbsp; }

}

```

For security reasons, Claude Code prompts for approval before using project-scoped servers from `.mcp.json` files. If you need to reset these approval choices, use the `claude mcp reset-project-choices` command.

\### User scope

User-scoped servers are stored in `~/.claude.json` and provide cross-project accessibility, making them available across all projects on your machine while remaining private to your user account. This scope works well for personal utility servers, development tools, or services you frequently use across different projects.

```bash theme={null}

\# Add a user server

claude mcp add --transport http hubspot --scope user https://mcp.hubspot.com/anthropic

```

\### Choosing the right scope

Select your scope based on:

\* \*\*Local scope\*\*: Personal servers, experimental configurations, or sensitive credentials specific to one project

\* \*\*Project scope\*\*: Team-shared servers, project-specific tools, or services required for collaboration

\* \*\*User scope\*\*: Personal utilities needed across multiple projects, development tools, or frequently used services

<Note>

&nbsp; \*\*Where are MCP servers stored?\*\*

&nbsp; \* \*\*User and local scope\*\*: `~/.claude.json` (in the `mcpServers` field or under project paths)

&nbsp; \* \*\*Project scope\*\*: `.mcp.json` in your project root (checked into source control)

&nbsp; \* \*\*Managed\*\*: `managed-mcp.json` in system directories (see \[Managed MCP configuration](#managed-mcp-configuration))

</Note>

\### Scope hierarchy and precedence

MCP server configurations follow a clear precedence hierarchy. When servers with the same name exist at multiple scopes, the system resolves conflicts by prioritizing local-scoped servers first, followed by project-scoped servers, and finally user-scoped servers. This design ensures that personal configurations can override shared ones when needed.

\### Environment variable expansion in `.mcp.json`

Claude Code supports environment variable expansion in `.mcp.json` files, allowing teams to share configurations while maintaining flexibility for machine-specific paths and sensitive values like API keys.

\*\*Supported syntax:\*\*

\* `${VAR}` - Expands to the value of environment variable `VAR`

\* `${VAR:-default}` - Expands to `VAR` if set, otherwise uses `default`

\*\*Expansion locations:\*\*

Environment variables can be expanded in:

\* `command` - The server executable path

\* `args` - Command-line arguments

\* `env` - Environment variables passed to the server

\* `url` - For HTTP server types

\* `headers` - For HTTP server authentication

\*\*Example with variable expansion:\*\*

```json theme={null}

{

&nbsp; "mcpServers": {

&nbsp;   "api-server": {

&nbsp;     "type": "http",

&nbsp;     "url": "${API\_BASE\_URL:-https://api.example.com}/mcp",

&nbsp;     "headers": {

&nbsp;       "Authorization": "Bearer ${API\_KEY}"

&nbsp;     }

&nbsp;   }

&nbsp; }

}

```

If a required environment variable is not set and has no default value, Claude Code will fail to parse the config.

\## Practical examples

{/\* ### Example: Automate browser testing with Playwright

&nbsp; ```bash

&nbsp; # 1. Add the Playwright MCP server

&nbsp; claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest

&nbsp; # 2. Write and run browser tests

&nbsp; > "Test if the login flow works with test@example.com"

&nbsp; > "Take a screenshot of the checkout page on mobile"

&nbsp; > "Verify that the search feature returns results"

&nbsp; ``` \*/}

\### Example: Monitor errors with Sentry

```bash theme={null}

\# 1. Add the Sentry MCP server

claude mcp add --transport http sentry https://mcp.sentry.dev/mcp



\# 2. Use /mcp to authenticate with your Sentry account

> /mcp



\# 3. Debug production issues

> "What are the most common errors in the last 24 hours?"

> "Show me the stack trace for error ID abc123"

> "Which deployment introduced these new errors?"

```

\### Example: Connect to GitHub for code reviews

```bash theme={null}

\# 1. Add the GitHub MCP server

claude mcp add --transport http github https://api.githubcopilot.com/mcp/



\# 2. In Claude Code, authenticate if needed

> /mcp

\# Select "Authenticate" for GitHub



\# 3. Now you can ask Claude to work with GitHub

> "Review PR #456 and suggest improvements"

> "Create a new issue for the bug we just found"

> "Show me all open PRs assigned to me"

```

\### Example: Query your PostgreSQL database

```bash theme={null}

\# 1. Add the database server with your connection string

claude mcp add --transport stdio db -- npx -y @bytebase/dbhub \\

&nbsp; --dsn "postgresql://readonly:pass@prod.db.com:5432/analytics"



\# 2. Query your database naturally

> "What's our total revenue this month?"

> "Show me the schema for the orders table"

> "Find customers who haven't made a purchase in 90 days"

```

\## Authenticate with remote MCP servers

Many cloud-based MCP servers require authentication. Claude Code supports OAuth 2.0 for secure connections.

<Steps>

&nbsp; <Step title="Add the server that requires authentication">

&nbsp; For example:

&nbsp; ```bash theme={null}

&nbsp; claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

&nbsp; ```

&nbsp; </Step>

&nbsp; <Step title="Use the /mcp command within Claude Code">

&nbsp; In Claude code, use the command:

&nbsp; ```

&nbsp; > /mcp

&nbsp; ```

&nbsp; Then follow the steps in your browser to login.

&nbsp; </Step>

</Steps>

<Tip>

&nbsp; Tips:

&nbsp; \* Authentication tokens are stored securely and refreshed automatically

&nbsp; \* Use "Clear authentication" in the `/mcp` menu to revoke access

&nbsp; \* If your browser doesn't open automatically, copy the provided URL

&nbsp; \* OAuth authentication works with HTTP servers

</Tip>

\### Use pre-configured OAuth credentials

Some MCP servers don't support automatic OAuth setup. If you see an error like "Incompatible auth server: does not support dynamic client registration," the server requires pre-configured credentials. Register an OAuth app through the server's developer portal first, then provide the credentials when adding the server.

<Steps>

&nbsp; <Step title="Register an OAuth app with the server">

&nbsp; Create an app through the server's developer portal and note your client ID and client secret.

&nbsp; Many servers also require a redirect URI. If so, choose a port and register a redirect URI in the format `http://localhost:PORT/callback`. Use that same port with `--callback-port` in the next step.

&nbsp; </Step>

&nbsp; <Step title="Add the server with your credentials">

&nbsp; Choose one of the following methods. The port used for `--callback-port` can be any available port. It just needs to match the redirect URI you registered in the previous step.

&nbsp; <Tabs>

&nbsp; <Tab title="claude mcp add">

&nbsp; Use `--client-id` to pass your app's client ID. The `--client-secret` flag prompts for the secret with masked input:

&nbsp; ```bash theme={null}

&nbsp; claude mcp add --transport http \\

&nbsp; --client-id your-client-id --client-secret --callback-port 8080 \\

&nbsp; my-server https://mcp.example.com/mcp

&nbsp; ```

&nbsp; </Tab>

&nbsp; <Tab title="claude mcp add-json">

&nbsp; Include the `oauth` object in the JSON config and pass `--client-secret` as a separate flag:

&nbsp; ```bash theme={null}

&nbsp; claude mcp add-json my-server \\

&nbsp; '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"your-client-id","callbackPort":8080}}' \\

&nbsp; --client-secret

&nbsp; ```

&nbsp; </Tab>

&nbsp; <Tab title="CI / env var">

&nbsp; Set the secret via environment variable to skip the interactive prompt:

&nbsp; ```bash theme={null}

&nbsp; MCP_CLIENT_SECRET=your-secret claude mcp add --transport http \\

&nbsp; --client-id your-client-id --client-secret --callback-port 8080 \\

&nbsp; my-server https://mcp.example.com/mcp

&nbsp; ```

&nbsp; </Tab>

&nbsp; </Tabs>

&nbsp; </Step>

&nbsp; <Step title="Authenticate in Claude Code">

&nbsp; Run `/mcp` in Claude Code and follow the browser login flow.

&nbsp; </Step>

</Steps>

<Tip>

&nbsp; Tips:

&nbsp; \* The client secret is stored securely in your system keychain (macOS) or a credentials file, not in your config

&nbsp; \* If the server uses a public OAuth client with no secret, use only `--client-id` without `--client-secret`

&nbsp; \* These flags only apply to HTTP and SSE transports. They have no effect on stdio servers

&nbsp; \* Use `claude mcp get <name>` to verify that OAuth credentials are configured for a server

</Tip>

\## Add MCP servers from JSON configuration

If you have a JSON configuration for an MCP server, you can add it directly:

<Steps>

&nbsp; <Step title="Add an MCP server from JSON">

&nbsp; ```bash theme={null}

&nbsp; # Basic syntax

&nbsp; claude mcp add-json <name> '<json>'

&nbsp; # Example: Adding an HTTP server with JSON configuration

&nbsp; claude mcp add-json weather-api '{"type":"http","url":"https://api.weather.com/mcp","headers":{"Authorization":"Bearer token"}}'

&nbsp; # Example: Adding a stdio server with JSON configuration

&nbsp; claude mcp add-json local-weather '{"type":"stdio","command":"/path/to/weather-cli","args":\["--api-key","abc123"],"env":{"CACHE_DIR":"/tmp"}}'

&nbsp; # Example: Adding an HTTP server with pre-configured OAuth credentials

&nbsp; claude mcp add-json my-server '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"your-client-id","callbackPort":8080}}' --client-secret

&nbsp; ```

&nbsp; </Step>

&nbsp; <Step title="Verify the server was added">

&nbsp; ```bash theme={null}

&nbsp; claude mcp get weather-api

&nbsp; ```

&nbsp; </Step>

</Steps>

<Tip>

&nbsp; Tips:

&nbsp; \* Make sure the JSON is properly escaped in your shell

&nbsp; \* The JSON must conform to the MCP server configuration schema

&nbsp; \* You can use `--scope user` to add the server to your user configuration instead of the project-specific one

</Tip>

\## Import MCP servers from Claude Desktop

If you've already configured MCP servers in Claude Desktop, you can import them:

<Steps>

&nbsp; <Step title="Import servers from Claude Desktop">

&nbsp; ```bash theme={null}

&nbsp; # Basic syntax

&nbsp; claude mcp add-from-claude-desktop

&nbsp; ```

&nbsp; </Step>

&nbsp; <Step title="Select which servers to import">

&nbsp; After running the command, you'll see an interactive dialog that allows you to select which servers you want to import.

&nbsp; </Step>

&nbsp; <Step title="Verify the servers were imported">

&nbsp; ```bash theme={null}

&nbsp; claude mcp list

&nbsp; ```

&nbsp; </Step>

</Steps>

<Tip>

&nbsp; Tips:

&nbsp; \* This feature only works on macOS and Windows Subsystem for Linux (WSL)

&nbsp; \* It reads the Claude Desktop configuration file from its standard location on those platforms

&nbsp; \* Use the `--scope user` flag to add servers to your user configuration

&nbsp; \* Imported servers will have the same names as in Claude Desktop

&nbsp; \* If servers with the same names already exist, they will get a numerical suffix (for example, `server\_1`)

</Tip>

\## Use Claude Code as an MCP server

You can use Claude Code itself as an MCP server that other applications can connect to:

```bash theme={null}

\# Start Claude as a stdio MCP server

claude mcp serve

```

You can use this in Claude Desktop by adding this configuration to claude\\\_desktop\\\_config.json:

```json theme={null}

{

&nbsp; "mcpServers": {

&nbsp;   "claude-code": {

&nbsp;     "type": "stdio",

&nbsp;     "command": "claude",

&nbsp;     "args": \["mcp", "serve"],

&nbsp;     "env": {}

&nbsp;   }

&nbsp; }

}

```

<Warning>

&nbsp; \*\*Configuring the executable path\*\*: The `command` field must reference the Claude Code executable. If the `claude` command is not in your system's PATH, you'll need to specify the full path to the executable.

&nbsp; To find the full path:

&nbsp; ```bash theme={null}

&nbsp; which claude

&nbsp; ```

&nbsp; Then use the full path in your configuration:

&nbsp; ```json theme={null}

&nbsp; {

&nbsp; "mcpServers": {

&nbsp; "claude-code": {

&nbsp; "type": "stdio",

&nbsp; "command": "/full/path/to/claude",

&nbsp; "args": \["mcp", "serve"],

&nbsp; "env": {}

&nbsp; }

&nbsp; }

&nbsp; }

&nbsp; ```

&nbsp; Without the correct executable path, you'll encounter errors like `spawn claude ENOENT`.

</Warning>

<Tip>

&nbsp; Tips:

&nbsp; \* The server provides access to Claude's tools like View, Edit, LS, etc.

&nbsp; \* In Claude Desktop, try asking Claude to read files in a directory, make edits, and more.

&nbsp; \* Note that this MCP server is only exposing Claude Code's tools to your MCP client, so your own client is responsible for implementing user confirmation for individual tool calls.

</Tip>

\## MCP output limits and warnings

When MCP tools produce large outputs, Claude Code helps manage the token usage to prevent overwhelming your conversation context:

\* \*\*Output warning threshold\*\*: Claude Code displays a warning when any MCP tool output exceeds 10,000 tokens

\* \*\*Configurable limit\*\*: You can adjust the maximum allowed MCP output tokens using the `MAX\_MCP\_OUTPUT\_TOKENS` environment variable

\* \*\*Default limit\*\*: The default maximum is 25,000 tokens

To increase the limit for tools that produce large outputs:

```bash theme={null}

\# Set a higher limit for MCP tool outputs

export MAX\_MCP\_OUTPUT\_TOKENS=50000

claude

```

This is particularly useful when working with MCP servers that:

\* Query large datasets or databases

\* Generate detailed reports or documentation

\* Process extensive log files or debugging information

<Warning>

&nbsp; If you frequently encounter output warnings with specific MCP servers, consider increasing the limit or configuring the server to paginate or filter its responses.

</Warning>

\## Use MCP resources

MCP servers can expose resources that you can reference using @ mentions, similar to how you reference files.

\### Reference MCP resources

<Steps>

&nbsp; <Step title="List available resources">

&nbsp; Type `@` in your prompt to see available resources from all connected MCP servers. Resources appear alongside files in the autocomplete menu.

&nbsp; </Step>

&nbsp; <Step title="Reference a specific resource">

&nbsp; Use the format `@server:protocol://resource/path` to reference a resource:

&nbsp; ```

&nbsp; > Can you analyze @github:issue://123 and suggest a fix?

&nbsp; ```

&nbsp; ```

&nbsp; > Please review the API documentation at @docs:file://api/authentication

&nbsp; ```

&nbsp; </Step>

&nbsp; <Step title="Multiple resource references">

&nbsp; You can reference multiple resources in a single prompt:

&nbsp; ```

&nbsp; > Compare @postgres:schema://users with @docs:file://database/user-model

&nbsp; ```

&nbsp; </Step>

</Steps>

<Tip>

&nbsp; Tips:

&nbsp; \* Resources are automatically fetched and included as attachments when referenced

&nbsp; \* Resource paths are fuzzy-searchable in the @ mention autocomplete

&nbsp; \* Claude Code automatically provides tools to list and read MCP resources when servers support them

&nbsp; \* Resources can contain any type of content that the MCP server provides (text, JSON, structured data, etc.)

</Tip>

\## Scale with MCP Tool Search

When you have many MCP servers configured, tool definitions can consume a significant portion of your context window. MCP Tool Search solves this by dynamically loading tools on-demand instead of preloading all of them.

\### How it works

Claude Code automatically enables Tool Search when your MCP tool descriptions would consume more than 10% of the context window. You can \[adjust this threshold](#configure-tool-search) or disable tool search entirely. When triggered:

1\. MCP tools are deferred rather than loaded into context upfront

2\. Claude uses a search tool to discover relevant MCP tools when needed

3\. Only the tools Claude actually needs are loaded into context

4\. MCP tools continue to work exactly as before from your perspective

\### For MCP server authors

If you're building an MCP server, the server instructions field becomes more useful with Tool Search enabled. Server instructions help Claude understand when to search for your tools, similar to how \[skills](/en/skills) work.

Add clear, descriptive server instructions that explain:

\* What category of tasks your tools handle

\* When Claude should search for your tools

\* Key capabilities your server provides

\### Configure tool search

Tool search runs in auto mode by default, meaning it activates only when your MCP tool definitions exceed the context threshold. If you have few tools, they load normally without tool search. This feature requires models that support `tool\_reference` blocks: Sonnet 4 and later, or Opus 4 and later. Haiku models do not support tool search.

Control tool search behavior with the `ENABLE\_TOOL\_SEARCH` environment variable:

| Value | Behavior |

| :--------- | :--------------------------------------------------------------------------------- |

| `auto` | Activates when MCP tools exceed 10% of context (default) |

| `auto:<N>` | Activates at custom threshold, where `<N>` is a percentage (e.g., `auto:5` for 5%) |

| `true` | Always enabled |

| `false` | Disabled, all MCP tools loaded upfront |

```bash theme={null}

\# Use a custom 5% threshold

ENABLE\_TOOL\_SEARCH=auto:5 claude



\# Disable tool search entirely

ENABLE\_TOOL\_SEARCH=false claude

```

Or set the value in your \[settings.json `env` field](/en/settings#available-settings).

You can also disable the MCPSearch tool specifically using the `disallowedTools` setting:

```json theme={null}

{

&nbsp; "permissions": {

&nbsp;   "deny": \["MCPSearch"]

&nbsp; }

}

```

\## Use MCP prompts as commands

MCP servers can expose prompts that become available as commands in Claude Code.

\### Execute MCP prompts

<Steps>

&nbsp; <Step title="Discover available prompts">

&nbsp; Type `/` to see all available commands, including those from MCP servers. MCP prompts appear with the format `/mcp\_\_servername\_\_promptname`.

&nbsp; </Step>

&nbsp; <Step title="Execute a prompt without arguments">

&nbsp; ```

&nbsp; > /mcp\_\_github\_\_list_prs

&nbsp; ```

&nbsp; </Step>

&nbsp; <Step title="Execute a prompt with arguments">

&nbsp; Many prompts accept arguments. Pass them space-separated after the command:

&nbsp; ```

&nbsp; > /mcp\_\_github\_\_pr_review 456

&nbsp; ```

&nbsp; ```

&nbsp; > /mcp\_\_jira\_\_create_issue "Bug in login flow" high

&nbsp; ```

&nbsp; </Step>

</Steps>

<Tip>

&nbsp; Tips:

&nbsp; \* MCP prompts are dynamically discovered from connected servers

&nbsp; \* Arguments are parsed based on the prompt's defined parameters

&nbsp; \* Prompt results are injected directly into the conversation

&nbsp; \* Server and prompt names are normalized (spaces become underscores)

</Tip>

\## Managed MCP configuration

For organizations that need centralized control over MCP servers, Claude Code supports two configuration options:

1\. \*\*Exclusive control with `managed-mcp.json`\*\*: Deploy a fixed set of MCP servers that users cannot modify or extend

2\. \*\*Policy-based control with allowlists/denylists\*\*: Allow users to add their own servers, but restrict which ones are permitted

These options allow IT administrators to:

\* \*\*Control which MCP servers employees can access\*\*: Deploy a standardized set of approved MCP servers across the organization

\* \*\*Prevent unauthorized MCP servers\*\*: Restrict users from adding unapproved MCP servers

\* \*\*Disable MCP entirely\*\*: Remove MCP functionality completely if needed

\### Option 1: Exclusive control with managed-mcp.json

When you deploy a `managed-mcp.json` file, it takes \*\*exclusive control\*\* over all MCP servers. Users cannot add, modify, or use any MCP servers other than those defined in this file. This is the simplest approach for organizations that want complete control.

System administrators deploy the configuration file to a system-wide directory:

\* macOS: `/Library/Application Support/ClaudeCode/managed-mcp.json`

\* Linux and WSL: `/etc/claude-code/managed-mcp.json`

\* Windows: `C:\\Program Files\\ClaudeCode\\managed-mcp.json`

<Note>

&nbsp; These are system-wide paths (not user home directories like `~/Library/...`) that require administrator privileges. They are designed to be deployed by IT administrators.

</Note>

The `managed-mcp.json` file uses the same format as a standard `.mcp.json` file:

```json theme={null}

{

&nbsp; "mcpServers": {

&nbsp;   "github": {

&nbsp;     "type": "http",

&nbsp;     "url": "https://api.githubcopilot.com/mcp/"

&nbsp;   },

&nbsp;   "sentry": {

&nbsp;     "type": "http",

&nbsp;     "url": "https://mcp.sentry.dev/mcp"

&nbsp;   },

&nbsp;   "company-internal": {

&nbsp;     "type": "stdio",

&nbsp;     "command": "/usr/local/bin/company-mcp-server",

&nbsp;     "args": \["--config", "/etc/company/mcp-config.json"],

&nbsp;     "env": {

&nbsp;       "COMPANY\_API\_URL": "https://internal.company.com"

&nbsp;     }

&nbsp;   }

&nbsp; }

}

```

\### Option 2: Policy-based control with allowlists and denylists

Instead of taking exclusive control, administrators can allow users to configure their own MCP servers while enforcing restrictions on which servers are permitted. This approach uses `allowedMcpServers` and `deniedMcpServers` in the \[managed settings file](/en/settings#settings-files).

<Note>

&nbsp; \*\*Choosing between options\*\*: Use Option 1 (`managed-mcp.json`) when you want to deploy a fixed set of servers with no user customization. Use Option 2 (allowlists/denylists) when you want to allow users to add their own servers within policy constraints.

</Note>

\#### Restriction options

Each entry in the allowlist or denylist can restrict servers in three ways:

1\. \*\*By server name\*\* (`serverName`): Matches the configured name of the server

2\. \*\*By command\*\* (`serverCommand`): Matches the exact command and arguments used to start stdio servers

3\. \*\*By URL pattern\*\* (`serverUrl`): Matches remote server URLs with wildcard support

\*\*Important\*\*: Each entry must have exactly one of `serverName`, `serverCommand`, or `serverUrl`.

\#### Example configuration

```json theme={null}

{

&nbsp; "allowedMcpServers": \[

&nbsp;   // Allow by server name

&nbsp;   { "serverName": "github" },

&nbsp;   { "serverName": "sentry" },



&nbsp;   // Allow by exact command (for stdio servers)

&nbsp;   { "serverCommand": \["npx", "-y", "@modelcontextprotocol/server-filesystem"] },

&nbsp;   { "serverCommand": \["python", "/usr/local/bin/approved-server.py"] },



&nbsp;   // Allow by URL pattern (for remote servers)

&nbsp;   { "serverUrl": "https://mcp.company.com/\*" },

&nbsp;   { "serverUrl": "https://\*.internal.corp/\*" }

&nbsp; ],

&nbsp; "deniedMcpServers": \[

&nbsp;   // Block by server name

&nbsp;   { "serverName": "dangerous-server" },



&nbsp;   // Block by exact command (for stdio servers)

&nbsp;   { "serverCommand": \["npx", "-y", "unapproved-package"] },



&nbsp;   // Block by URL pattern (for remote servers)

&nbsp;   { "serverUrl": "https://\*.untrusted.com/\*" }

&nbsp; ]

}

```

\#### How command-based restrictions work

\*\*Exact matching\*\*:

\* Command arrays must match \*\*exactly\*\* - both the command and all arguments in the correct order

\* Example: `\["npx", "-y", "server"]` will NOT match `\["npx", "server"]` or `\["npx", "-y", "server", "--flag"]`

\*\*Stdio server behavior\*\*:

\* When the allowlist contains \*\*any\*\* `serverCommand` entries, stdio servers \*\*must\*\* match one of those commands

\* Stdio servers cannot pass by name alone when command restrictions are present

\* This ensures administrators can enforce which commands are allowed to run

\*\*Non-stdio server behavior\*\*:

\* Remote servers (HTTP, SSE, WebSocket) use URL-based matching when `serverUrl` entries exist in the allowlist

\* If no URL entries exist, remote servers fall back to name-based matching

\* Command restrictions do not apply to remote servers

\#### How URL-based restrictions work

URL patterns support wildcards using `\*` to match any sequence of characters. This is useful for allowing entire domains or subdomains.

\*\*Wildcard examples\*\*:

\* `https://mcp.company.com/\*` - Allow all paths on a specific domain

\* `https://\*.example.com/\*` - Allow any subdomain of example.com

\* `http://localhost:\*/\*` - Allow any port on localhost

\*\*Remote server behavior\*\*:

\* When the allowlist contains \*\*any\*\* `serverUrl` entries, remote servers \*\*must\*\* match one of those URL patterns

\* Remote servers cannot pass by name alone when URL restrictions are present

\* This ensures administrators can enforce which remote endpoints are allowed

<Accordion title="Example: URL-only allowlist">

&nbsp; ```json theme={null}

&nbsp; {

&nbsp; "allowedMcpServers": \[

&nbsp; { "serverUrl": "https://mcp.company.com/\*" },

&nbsp; { "serverUrl": "https://\*.internal.corp/\*" }

&nbsp; ]

&nbsp; }

&nbsp; ```

&nbsp; \*\*Result\*\*:

&nbsp; \* HTTP server at `https://mcp.company.com/api`: ✅ Allowed (matches URL pattern)

&nbsp; \* HTTP server at `https://api.internal.corp/mcp`: ✅ Allowed (matches wildcard subdomain)

&nbsp; \* HTTP server at `https://external.com/mcp`: ❌ Blocked (doesn't match any URL pattern)

&nbsp; \* Stdio server with any command: ❌ Blocked (no name or command entries to match)

</Accordion>

<Accordion title="Example: Command-only allowlist">

&nbsp; ```json theme={null}

&nbsp; {

&nbsp; "allowedMcpServers": \[

&nbsp; { "serverCommand": \["npx", "-y", "approved-package"] }

&nbsp; ]

&nbsp; }

&nbsp; ```

&nbsp; \*\*Result\*\*:

&nbsp; \* Stdio server with `\["npx", "-y", "approved-package"]`: ✅ Allowed (matches command)

&nbsp; \* Stdio server with `\["node", "server.js"]`: ❌ Blocked (doesn't match command)

&nbsp; \* HTTP server named "my-api": ❌ Blocked (no name entries to match)

</Accordion>

<Accordion title="Example: Mixed name and command allowlist">

&nbsp; ```json theme={null}

&nbsp; {

&nbsp; "allowedMcpServers": \[

&nbsp; { "serverName": "github" },

&nbsp; { "serverCommand": \["npx", "-y", "approved-package"] }

&nbsp; ]

&nbsp; }

&nbsp; ```

&nbsp; \*\*Result\*\*:

&nbsp; \* Stdio server named "local-tool" with `\["npx", "-y", "approved-package"]`: ✅ Allowed (matches command)

&nbsp; \* Stdio server named "local-tool" with `\["node", "server.js"]`: ❌ Blocked (command entries exist but doesn't match)

&nbsp; \* Stdio server named "github" with `\["node", "server.js"]`: ❌ Blocked (stdio servers must match commands when command entries exist)

&nbsp; \* HTTP server named "github": ✅ Allowed (matches name)

&nbsp; \* HTTP server named "other-api": ❌ Blocked (name doesn't match)

</Accordion>

<Accordion title="Example: Name-only allowlist">

&nbsp; ```json theme={null}

&nbsp; {

&nbsp; "allowedMcpServers": \[

&nbsp; { "serverName": "github" },

&nbsp; { "serverName": "internal-tool" }

&nbsp; ]

&nbsp; }

&nbsp; ```

&nbsp; \*\*Result\*\*:

&nbsp; \* Stdio server named "github" with any command: ✅ Allowed (no command restrictions)

&nbsp; \* Stdio server named "internal-tool" with any command: ✅ Allowed (no command restrictions)

&nbsp; \* HTTP server named "github": ✅ Allowed (matches name)

&nbsp; \* Any server named "other": ❌ Blocked (name doesn't match)

</Accordion>

\#### Allowlist behavior (`allowedMcpServers`)

\* `undefined` (default): No restrictions - users can configure any MCP server

\* Empty array `\[]`: Complete lockdown - users cannot configure any MCP servers

\* List of entries: Users can only configure servers that match by name, command, or URL pattern

\#### Denylist behavior (`deniedMcpServers`)

\* `undefined` (default): No servers are blocked

\* Empty array `\[]`: No servers are blocked

\* List of entries: Specified servers are explicitly blocked across all scopes

\#### Important notes

\* \*\*Option 1 and Option 2 can be combined\*\*: If `managed-mcp.json` exists, it has exclusive control and users cannot add servers. Allowlists/denylists still apply to the managed servers themselves.

\* \*\*Denylist takes absolute precedence\*\*: If a server matches a denylist entry (by name, command, or URL), it will be blocked even if it's on the allowlist

\* Name-based, command-based, and URL-based restrictions work together: a server passes if it matches \*\*either\*\* a name entry, a command entry, or a URL pattern (unless blocked by denylist)

<Note>

&nbsp; \*\*When using `managed-mcp.json`\*\*: Users cannot add MCP servers through `claude mcp add` or configuration files. The `allowedMcpServers` and `deniedMcpServers` settings still apply to filter which managed servers are actually loaded.

</Note>
