---
name: docker-compose
description: Docker Compose container orchestration and management. Manage multi-container applications, services, networks, and volumes. Use for local development, testing, and orchestration of containerized applications.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Glob]
best_practices:
  - Prefer compose.yaml (canonical V2 name) over docker-compose.yml
  - Use `docker compose` (V2 plugin) never `docker-compose` (V1 binary)
  - Verify compose.yaml exists before operations
  - Use project names for isolation
  - Check service status before destructive operations
  - Avoid volume removal without confirmation
  - Review logs before restarting failed services
  - Define healthchecks on all stateful services
  - Use profiles for environment-specific services
  - Use watch + develop block for live development reloading
error_handling: graceful
streaming: supported
safety_level: high
verified: true
lastVerifiedAt: 2026-02-19T06:00:00.000Z
---

# Docker Compose Skill

## Installation

The skill invokes `docker compose`. Easiest: install **Docker Desktop** (includes Docker Engine + Compose):

- **Windows**: [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) (WSL 2 or Hyper-V)
- **Mac**: [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) (Apple Silicon or Intel)
- **Linux**: [Docker Desktop for Linux](https://docs.docker.com/desktop/setup/install/linux/) or Docker Engine + Compose plugin from Docker's repo

Verify: `docker compose version`

## Cheat Sheet & Best Practices

**Commands:** `docker compose up -d` / `down`; `docker compose ps` / `logs -f <service>`; `docker compose exec <service> sh`; `docker compose build --no-cache`; `docker compose -f compose.prod.yaml config` — validate.

**YAML:** Use named volumes for DBs (`postgres_data:/var/lib/postgresql/data`). Use healthchecks (`healthcheck:` with `test`, `interval`, `timeout`, `retries`). One network default; reference services by name (e.g. `http://api:3000`). Use `env_file` or `environment`; keep secrets in `secrets:`.

**Hacks:** `-f compose.yaml -f override.yaml` merges files (later overrides). Use `--project-name` for isolation. Prefer `build: context: . dockerfile: Dockerfile` for dev; pin image tags in prod. Run `docker compose config` before `up` to catch errors.

## Certifications & Training

**Docker Certified Associate (DCA):** Orchestration 25%, Image/Registry 20%, Install/Config 15%, Networking 15%, Security 15%, Storage 10%. Free: [Official DCA Study Guide](https://www.docker.com/certification/), [Coursera DCA Prep](https://www.coursera.org/specializations/docker-certified-associate-dca-course) (audit). **Skill data:** Compose YAML (services, volumes, networks, healthchecks), CLI (up/down/ps/logs/exec).

## Hooks & Workflows

**Suggested hooks:** Pre-up: `docker compose config` (validate). Post-down: optional cleanup. Use when **devops** or **devops-troubleshooter** is routed.

**Workflows:** Use with **devops** (primary), **devops-troubleshooter** (primary). Flow: validate compose → up/down/exec per task. See `operations/incident-response` for container debugging.

## Overview

This skill provides comprehensive Docker Compose management, enabling AI agents to orchestrate multi-container applications, manage services, inspect logs, and troubleshoot containerized environments with progressive disclosure for optimal context usage.

**Context Savings**: ~92% reduction

- **MCP Mode**: ~25,000 tokens always loaded (multiple tools + schemas)
- **Skill Mode**: ~700 tokens metadata + on-demand loading

## When to Use

- Managing local development environments
- Orchestrating multi-container applications
- Debugging service connectivity and networking
- Monitoring container logs and health
- Building and updating service images
- Testing containerized application stacks
- Troubleshooting service failures
- Managing application lifecycle (start, stop, restart)

## Requirements

- Docker Engine installed and running
- Docker Compose V2 (`docker compose` plugin — V1 `docker-compose` is end-of-life)
- Valid `compose.yaml` (preferred) or `compose.yml` / `docker-compose.yml` in project
- Appropriate permissions for Docker socket access

## Quick Reference

```bash
# List running services
docker compose ps

# View service logs
docker compose logs <service>

# Start services
docker compose up -d

# Stop services
docker compose down

# Rebuild services
docker compose build

# Execute command in container
docker compose exec <service> <command>

# Live development reloading (Compose Watch)
docker compose watch

# Start with a profile active
docker compose --profile debug up -d

# Validate merged config
docker compose config
```

## 2026 Feature Highlights

### compose.yaml — Canonical Filename

Docker Compose V2 prefers `compose.yaml` (and `compose.yml`) over the legacy `docker-compose.yml`.
The `version:` top-level field is **deprecated** and should be omitted entirely in new files.

```yaml
# compose.yaml  (preferred — no version: field needed)
services:
  web:
    build: .
    ports:
      - '8080:80'
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: example
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Compose Watch — Live Development Reloading

Compose Watch (GA as of Compose 2.22+) replaces the manual rebuild-restart cycle during development. Configure a `develop.watch` block per service. Three actions are available:

| Action         | Behavior                                                          |
| -------------- | ----------------------------------------------------------------- |
| `sync`         | Instantly copies changed files into the running container         |
| `rebuild`      | Triggers `docker compose build` + recreates the container         |
| `sync+restart` | Syncs files then restarts the container process (no full rebuild) |

```yaml
services:
  api:
    build: .
    ports:
      - '3000:3000'
    develop:
      watch:
        # Sync source instantly — no rebuild needed for interpreted code
        - action: sync
          path: ./src
          target: /app/src
          ignore:
            - node_modules/
        # Rebuild when dependency manifest changes
        - action: rebuild
          path: package.json
        # Restart only when config changes
        - action: sync+restart
          path: ./config
          target: /app/config
```

Start with:

```bash
# Watch mode (keeps output in foreground)
docker compose watch

# Or combined with up
docker compose up --watch
```

**When to use each action:**

- `sync` — interpreted languages (Node.js, Python, Ruby) where the runtime picks up changes
- `sync+restart` — config or template files that require a process restart but not a full rebuild
- `rebuild` — dependency manifest changes (`package.json`, `requirements.txt`, `go.mod`)

### Profiles — Environment-Specific Services

Profiles allow a single `compose.yaml` to serve multiple environments. Services **without** a profile always start. Services **with** profiles only start when that profile is activated.

```yaml
services:
  # Always starts — no profile
  api:
    build: .
    ports:
      - '3000:3000'
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 3s
      retries: 5
    volumes:
      - db_data:/var/lib/postgresql/data

  # Only with --profile debug
  pgadmin:
    image: dpage/pgadmin4:latest
    profiles: ['debug']
    ports:
      - '5050:80'
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@admin.com
      PGADMIN_DEFAULT_PASSWORD: admin

  # Only with --profile monitoring
  prometheus:
    image: prom/prometheus:latest
    profiles: ['monitoring']
    ports:
      - '9090:9090'

  grafana:
    image: grafana/grafana:latest
    profiles: ['monitoring']
    ports:
      - '3001:3000'

volumes:
  db_data:
```

```bash
# Default: api + db only
docker compose up -d

# Debug: api + db + pgadmin
docker compose --profile debug up -d

# Monitoring: api + db + prometheus + grafana
docker compose --profile monitoring up -d

# Multiple profiles
docker compose --profile debug --profile monitoring up -d

# Via environment variable
COMPOSE_PROFILES=debug,monitoring docker compose up -d
```

**Profile naming rules:** `[a-zA-Z0-9][a-zA-Z0-9_.-]+` — lowercase kebab-case recommended.

### Include — Composable Configs

The `include` top-level key (introduced in Compose 2.20) allows you to split large compose files into modular, team-owned pieces. Each included file is loaded with its own project directory context, resolving relative paths correctly.

```yaml
# compose.yaml (root — application layer)
include:
  - ./infra/compose.yaml # DB, Redis, message broker
  - ./monitoring/compose.yaml # Prometheus, Grafana

services:
  api:
    build: .
    depends_on:
      - db # defined in infra/compose.yaml
      - redis # defined in infra/compose.yaml
```

```yaml
# infra/compose.yaml (infrastructure layer — owned by platform team)
services:
  db:
    image: postgres:16-alpine
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 3s
      retries: 5
    volumes:
      - db_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  db_data:
```

`include` is recursive — included files can themselves include other files. Conflicts between resource names cause an error (no silent merging).

### Healthcheck Best Practices

Always define healthchecks on stateful services so that `depends_on: condition: service_healthy` works correctly. Without healthchecks, dependent services may start before their dependency is ready.

```yaml
services:
  db:
    image: postgres:16-alpine
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-postgres}']
      interval: 10s # How often to check
      timeout: 5s # Time to wait for response
      retries: 5 # Failures before marking unhealthy
      start_period: 30s # Grace period during container startup

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 3

  api:
    build: .
    depends_on:
      db:
        condition: service_healthy # waits until db passes healthcheck
      redis:
        condition: service_healthy
```

**Healthcheck guidelines:**

- Use `CMD` (array form) not `CMD-SHELL` (string form) where possible — avoids shell injection risk
- Use `CMD-SHELL` only when you need shell features (`pg_isready`, `curl -f`, etc.)
- Set `start_period` for services with slow startup (JVM apps, first-run migrations)
- Avoid `curl` in Alpine-based images unless explicitly installed; prefer `wget -q --spider` or native checks
- For HTTP services: `test: ["CMD-SHELL", "wget -q --spider http://localhost:3000/health || exit 1"]`

### Multi-Stage Build Pattern

Use multi-stage Dockerfiles to keep production images minimal and secure. Reference the specific build stage in compose.yaml for development.

```dockerfile
# Dockerfile
# Stage 1: deps — install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: builder — compile/transpile
FROM deps AS builder
COPY . .
RUN npm run build

# Stage 3: runner — minimal production image
FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=deps    --chown=appuser:appgroup /app/node_modules ./node_modules
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

```yaml
# compose.yaml — dev targets the builder stage for faster iteration
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: builder # Stop at builder stage in dev (includes devDeps)
    develop:
      watch:
        - action: sync
          path: ./src
          target: /app/src
          ignore:
            - node_modules/
        - action: rebuild
          path: package.json
```

```yaml
# compose.prod.yaml — production uses the full runner stage
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner # Minimal, non-root production image
    restart: unless-stopped
```

### Resource Limits (Best Practice)

Always define resource limits to prevent container resource exhaustion:

```yaml
services:
  api:
    image: myapp:latest
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
    restart: unless-stopped
```

## Tools

The skill provides 15 tools across service management, monitoring, build operations, and troubleshooting categories:

### Service Management (5 tools)

#### up

Start services defined in compose.yaml.

| Parameter        | Type    | Description                  | Default        |
| ---------------- | ------- | ---------------------------- | -------------- |
| `detached`       | boolean | Run in detached mode         | true           |
| `build`          | boolean | Build images before starting | false          |
| `force_recreate` | boolean | Recreate containers          | false          |
| `project_name`   | string  | Project name override        | directory name |
| `services`       | array   | Specific services to start   | all services   |
| `profiles`       | array   | Profiles to activate         | none           |
| `watch`          | boolean | Enable Compose Watch mode    | false          |

**Example**:

```bash
docker compose up -d
docker compose up --build
docker compose up web api
docker compose --profile debug up -d
docker compose up --watch
```

**Safety**: Requires confirmation for production environments.

#### down

Stop and remove containers, networks, volumes.

| Parameter        | Type    | Description                | Default        |
| ---------------- | ------- | -------------------------- | -------------- |
| `volumes`        | boolean | Remove volumes (BLOCKED)   | false          |
| `remove_orphans` | boolean | Remove orphaned containers | false          |
| `project_name`   | string  | Project name override      | directory name |

**Example**:

```bash
docker compose down
docker compose down --remove-orphans
```

**Safety**: Volume removal (`-v` flag) is **BLOCKED** by default. Requires confirmation.

#### start

Start existing containers without recreating them.

| Parameter      | Type   | Description                | Default        |
| -------------- | ------ | -------------------------- | -------------- |
| `services`     | array  | Specific services to start | all services   |
| `project_name` | string | Project name override      | directory name |

**Example**:

```bash
docker compose start
docker compose start web
```

#### stop

Stop running containers without removing them.

| Parameter      | Type   | Description                | Default        |
| -------------- | ------ | -------------------------- | -------------- |
| `timeout`      | number | Shutdown timeout (seconds) | 10             |
| `services`     | array  | Specific services to stop  | all services   |
| `project_name` | string | Project name override      | directory name |

**Example**:

```bash
docker compose stop
docker compose stop --timeout 30 web
```

#### restart

Restart services (stop + start).

| Parameter      | Type   | Description                  | Default        |
| -------------- | ------ | ---------------------------- | -------------- |
| `timeout`      | number | Shutdown timeout (seconds)   | 10             |
| `services`     | array  | Specific services to restart | all services   |
| `project_name` | string | Project name override        | directory name |

**Example**:

```bash
docker compose restart
docker compose restart api
```

### Status & Logs (3 tools)

#### ps

List containers with status information.

| Parameter      | Type    | Description                             | Default        |
| -------------- | ------- | --------------------------------------- | -------------- |
| `all`          | boolean | Show all containers (including stopped) | false          |
| `services`     | array   | Filter by services                      | all services   |
| `project_name` | string  | Project name override                   | directory name |

**Example**:

```bash
docker compose ps
docker compose ps --all
```

**Output Fields**: NAME, IMAGE, STATUS, PORTS

#### logs

View service logs with streaming support.

| Parameter      | Type    | Description                        | Default        |
| -------------- | ------- | ---------------------------------- | -------------- |
| `services`     | array   | Services to view logs for          | all services   |
| `follow`       | boolean | Follow log output (stream)         | false          |
| `tail`         | number  | Number of lines to show            | 100            |
| `timestamps`   | boolean | Show timestamps                    | false          |
| `since`        | string  | Show logs since timestamp/duration | none           |
| `project_name` | string  | Project name override              | directory name |

**Example**:

```bash
docker compose logs web
docker compose logs --tail 50 --follow api
docker compose logs --since "2026-01-01T10:00:00"
```

**Note**: Follow mode automatically terminates after 60 seconds to prevent indefinite streaming.

#### top

Display running processes in containers.

| Parameter      | Type   | Description           | Default        |
| -------------- | ------ | --------------------- | -------------- |
| `services`     | array  | Services to inspect   | all services   |
| `project_name` | string | Project name override | directory name |

**Example**:

```bash
docker compose top
docker compose top web
```

**Output**: Process list with PID, USER, TIME, COMMAND

### Build & Images (3 tools)

#### build

Build or rebuild service images.

| Parameter      | Type    | Description               | Default        |
| -------------- | ------- | ------------------------- | -------------- |
| `no_cache`     | boolean | Build without cache       | false          |
| `pull`         | boolean | Pull newer image versions | false          |
| `parallel`     | boolean | Build in parallel         | true           |
| `services`     | array   | Services to build         | all services   |
| `project_name` | string  | Project name override     | directory name |

**Example**:

```bash
docker compose build
docker compose build --no-cache web
docker compose build --pull
```

**Safety**: Requires confirmation for no-cache builds (resource-intensive).

#### pull

Pull service images from registry.

| Parameter              | Type    | Description            | Default        |
| ---------------------- | ------- | ---------------------- | -------------- |
| `ignore_pull_failures` | boolean | Continue if pull fails | false          |
| `services`             | array   | Services to pull       | all services   |
| `project_name`         | string  | Project name override  | directory name |

**Example**:

```bash
docker compose pull
docker compose pull web api
```

**Safety**: Requires confirmation for production environments.

#### images

List images used by services.

| Parameter      | Type   | Description           | Default        |
| -------------- | ------ | --------------------- | -------------- |
| `project_name` | string | Project name override | directory name |

**Example**:

```bash
docker compose images
```

**Output Fields**: CONTAINER, REPOSITORY, TAG, IMAGE ID, SIZE

### Execution (2 tools)

#### exec

Execute a command in a running container.

| Parameter      | Type   | Description           | Required          |
| -------------- | ------ | --------------------- | ----------------- |
| `service`      | string | Service name          | Yes               |
| `command`      | array  | Command to execute    | Yes               |
| `user`         | string | User to execute as    | container default |
| `workdir`      | string | Working directory     | container default |
| `env`          | object | Environment variables | none              |
| `project_name` | string | Project name override | directory name    |

**Example**:

```bash
docker compose exec web bash
docker compose exec -u root api ls -la /app
docker compose exec db psql -U postgres
```

**Safety**:

- Destructive commands (`rm -rf`, `dd`, `mkfs`) are **BLOCKED**
- Root user execution requires confirmation
- Default timeout: 30 seconds

#### run

Run a one-off command in a new container.

| Parameter      | Type    | Description                 | Default           |
| -------------- | ------- | --------------------------- | ----------------- |
| `service`      | string  | Service to run              | Required          |
| `command`      | array   | Command to execute          | service default   |
| `rm`           | boolean | Remove container after run  | true              |
| `no_deps`      | boolean | Don't start linked services | false             |
| `user`         | string  | User to execute as          | container default |
| `env`          | object  | Environment variables       | none              |
| `project_name` | string  | Project name override       | directory name    |

**Example**:

```bash
docker compose run --rm web npm test
docker compose run --no-deps api python manage.py migrate
```

**Safety**: Requires confirmation for commands that modify data.

### Configuration (2 tools)

#### config

Validate and view the Compose file configuration.

| Parameter               | Type    | Description                | Default        |
| ----------------------- | ------- | -------------------------- | -------------- |
| `resolve_image_digests` | boolean | Pin image tags to digests  | false          |
| `no_interpolate`        | boolean | Don't interpolate env vars | false          |
| `project_name`          | string  | Project name override      | directory name |

**Example**:

```bash
docker compose config
docker compose config --resolve-image-digests
```

**Output**: Parsed and merged Compose configuration

#### port

Print the public port binding for a service port.

| Parameter      | Type   | Description           | Required       |
| -------------- | ------ | --------------------- | -------------- |
| `service`      | string | Service name          | Yes            |
| `private_port` | number | Container port        | Yes            |
| `protocol`     | string | Protocol (tcp/udp)    | tcp            |
| `project_name` | string | Project name override | directory name |

**Example**:

```bash
docker compose port web 80
docker compose port db 5432
```

**Output**: `<host>:<port>` binding

## Common Workflows

### Start a Development Environment

```bash
# 1. Validate configuration
docker compose config

# 2. Pull latest images
docker compose pull

# 3. Build custom images
docker compose build

# 4. Start services in detached mode
docker compose up -d

# 5. Check service status
docker compose ps

# 6. View logs
docker compose logs --tail 100
```

### Live Development with Compose Watch

```bash
# 1. Ensure develop.watch blocks are configured in compose.yaml

# 2. Start with watch mode (foreground, shows sync events)
docker compose watch

# 3. Or start detached then watch
docker compose up -d
docker compose watch --no-up
```

### Troubleshoot a Failing Service

```bash
# 1. Check container status
docker compose ps --all

# 2. View service logs
docker compose logs --tail 200 failing-service

# 3. Inspect running processes
docker compose top failing-service

# 4. Check configuration
docker compose config

# 5. Restart the service
docker compose restart failing-service

# 6. If needed, recreate container
docker compose up -d --force-recreate failing-service
```

### Update Service Images

```bash
# 1. Pull latest images
docker compose pull

# 2. Stop services
docker compose down

# 3. Rebuild if using custom Dockerfiles
docker compose build --pull

# 4. Start with new images
docker compose up -d

# 5. Verify services
docker compose ps
```

### Debug Service Connectivity

```bash
# 1. Check running services
docker compose ps

# 2. Inspect port mappings
docker compose port web 80
docker compose port api 3000

# 3. Exec into container
docker compose exec web sh

# 4. Test connectivity (from inside container)
docker compose exec web curl api:3000/health

# 5. Check logs for errors
docker compose logs web api
```

### Clean Up Environment

```bash
# 1. Stop all services
docker compose down

# 2. Remove orphaned containers
docker compose down --remove-orphans

# 3. View images
docker compose images

# 4. Clean up (manual - volume removal BLOCKED)
# Volumes require manual cleanup with explicit confirmation
```

### Use Profiles for Environment-Specific Services

```bash
# Development: default services only
docker compose up -d

# Development + debug tools
docker compose --profile debug up -d

# Start monitoring stack
docker compose --profile monitoring up -d

# Via env var (useful in CI)
COMPOSE_PROFILES=monitoring docker compose up -d

# Stop and clean a specific profile
docker compose --profile debug down
```

## Configuration

### Environment Variables

| Variable                 | Description                       | Default                        |
| ------------------------ | --------------------------------- | ------------------------------ |
| `COMPOSE_PROJECT_NAME`   | Default project name              | directory name                 |
| `COMPOSE_FILE`           | Compose file path                 | `compose.yaml`                 |
| `COMPOSE_PROFILES`       | Comma-separated active profiles   | (none)                         |
| `COMPOSE_PATH_SEPARATOR` | Path separator for multiple files | `:` (Linux/Mac), `;` (Windows) |
| `DOCKER_HOST`            | Docker daemon socket              | `unix:///var/run/docker.sock`  |
| `COMPOSE_HTTP_TIMEOUT`   | HTTP timeout for API calls        | 60                             |
| `COMPOSE_PARALLEL_LIMIT` | Max parallel operations           | unlimited                      |

### Setup

1. **Install Docker Engine**:

   ```bash
   # macOS
   brew install --cask docker

   # Linux (Ubuntu/Debian)
   sudo apt-get update
   sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin

   # Windows
   # Download Docker Desktop from docker.com
   ```

2. **Verify Docker Compose**:

   ```bash
   # Check Docker version
   docker --version

   # Check Compose version (must be V2, e.g. 2.24+)
   docker compose version
   ```

3. **Create compose.yaml** (no `version:` field — V2 does not require it):

   ```yaml
   services:
     web:
       build: .
       ports:
         - '8080:80'
       depends_on:
         db:
           condition: service_healthy
     db:
       image: postgres:16-alpine
       environment:
         POSTGRES_PASSWORD: example
       healthcheck:
         test: ['CMD-SHELL', 'pg_isready -U postgres']
         interval: 10s
         timeout: 5s
         retries: 5
   ```

4. **Test the skill**:

   ```bash
   docker compose config
   docker compose ps
   ```

## Safety Features

### Blocked Operations

The following operations are **BLOCKED** by default to prevent accidental data loss:

- **Volume removal**: `docker compose down -v` (BLOCKED - requires manual confirmation)
- **Full cleanup**: `docker compose down -v --rmi all` (BLOCKED - extremely destructive)
- **Destructive exec**: `rm -rf`, `dd`, `mkfs`, `sudo rm` inside containers (BLOCKED)
- **Force removal**: `docker compose rm -f` (BLOCKED - use stop then rm)

### Confirmation Required

These operations require explicit confirmation:

- Building with `--no-cache` (resource-intensive)
- Pulling images in production environments
- Starting services with `--force-recreate`
- Executing commands as root user
- Running commands that modify databases
- Stopping services with very short timeouts

### Auto-Terminating Operations

The following operations auto-terminate to prevent resource issues:

- Log following (`--follow`): 60-second timeout
- Service execution (`exec`): 30-second timeout
- One-off commands (`run`): 60-second timeout

## Error Handling

**Common Errors**:

| Error                             | Cause                 | Fix                                             |
| --------------------------------- | --------------------- | ----------------------------------------------- |
| `docker: command not found`       | Docker not installed  | Install Docker Engine                           |
| `Cannot connect to Docker daemon` | Docker not running    | Start Docker service                            |
| `network ... not found`           | Network cleanup issue | Run `docker compose down` then `up`             |
| `port is already allocated`       | Port conflict         | Change port mapping or stop conflicting service |
| `no configuration file provided`  | Missing compose file  | Create `compose.yaml`                           |
| `service ... must be built`       | Image not built       | Run `docker compose build`                      |
| `service unhealthy`               | Healthcheck failing   | Check `docker compose logs <service>`           |
| `include path not found`          | Missing included file | Verify paths in `include:` block                |

**Recovery**:

- Validate configuration: `docker compose config`
- Check Docker status: `docker info`
- View service logs: `docker compose logs`
- Force recreate: `docker compose up -d --force-recreate`
- Clean restart: `docker compose down && docker compose up -d`

## Integration with Agents

This skill integrates with the following agents:

### Primary Agents

- **devops**: Local development, CI/CD integration, container orchestration
- **developer**: Application development, testing, debugging

### Secondary Agents

- **qa**: Integration testing, test environment setup
- **incident-responder**: Debugging production issues, service recovery
- **cloud-integrator**: Cloud deployment, migration to Kubernetes
- **performance-engineer**: Performance testing, resource optimization

## Progressive Disclosure

The skill uses progressive disclosure to minimize context usage:

1. **Initial Load**: Only metadata and tool names (~700 tokens)
2. **Tool Invocation**: Specific tool schema loaded on-demand (~100-150 tokens)
3. **Result Streaming**: Large outputs (logs) streamed incrementally
4. **Context Cleanup**: Old results cleared after use

**Context Optimization**:

- Use `--tail` to limit log output
- Use service filters to target specific containers
- Prefer `ps` over `ps --all` for active services only
- Use `--since` for time-bounded log queries

## Troubleshooting

### Skill Issues

**Docker Compose not found**:

```bash
# Check Docker Compose version
docker compose version

# V1 (docker-compose) is end-of-life — upgrade to V2
# Docker Compose V2 is integrated into Docker CLI as a plugin
```

**Permission denied**:

```bash
# Add user to docker group (Linux)
sudo usermod -aG docker $USER
newgrp docker

# Verify permissions
docker ps
```

**Compose file issues**:

```bash
# Validate syntax
docker compose config

# Check for errors (quiet mode — exit code only)
docker compose config -q

# View resolved configuration
docker compose config --resolve-image-digests
```

**Network issues**:

```bash
# List networks
docker network ls

# Remove unused networks
docker network prune

# Recreate services
docker compose down
docker compose up -d
```

**Healthcheck failures**:

```bash
# Inspect healthcheck status
docker inspect <container_id> | grep -A 10 Health

# View healthcheck output
docker compose logs <service>

# Manually run the healthcheck command
docker compose exec <service> pg_isready -U postgres
```

**Compose Watch not syncing**:

```bash
# Verify develop.watch block is present in compose.yaml
docker compose config | grep -A 20 develop

# Ensure Compose version is 2.22+
docker compose version

# Watch requires build: attribute (not image: only)
```

## Performance Considerations

- **Build caching**: Use layer caching for faster builds; avoid `--no-cache` unless necessary
- **Multi-stage builds**: Dramatically reduce production image size (often 80%+)
- **Parallel operations**: Docker Compose V2 parallelizes by default; use `COMPOSE_PARALLEL_LIMIT` to control
- **Resource limits**: Define CPU/memory limits in compose file to prevent resource exhaustion
- **Log rotation**: Use logging drivers to prevent disk space issues
- **Volume cleanup**: Regularly clean unused volumes (requires manual confirmation)
- **Compose Watch vs bind mounts**: Prefer `develop.watch` for cross-platform development; bind mounts have I/O performance issues on macOS/Windows

## Related

- **Docker Compose Documentation**: <https://docs.docker.com/compose/>
- **Compose File Reference**: <https://docs.docker.com/compose/compose-file/>
- **Compose Watch Docs**: <https://docs.docker.com/compose/how-tos/file-watch/>
- **Compose Profiles Docs**: <https://docs.docker.com/compose/how-tos/profiles/>
- **Compose Include Docs**: <https://docs.docker.com/compose/how-tos/multiple-compose-files/include/>
- **Docker CLI**: <https://docs.docker.com/engine/reference/commandline/cli/>
- **Kubernetes Migration**: `.claude/skills/kubernetes-flux/` (Kubernetes orchestration)

## Sources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Compose V2](https://github.com/docker/compose)
- [Compose Specification](https://github.com/compose-spec/compose-spec)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Use Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/)
- [Use Compose Profiles](https://docs.docker.com/compose/how-tos/profiles/)
- [Compose Include Directive](https://docs.docker.com/compose/how-tos/multiple-compose-files/include/)

## Related Skills

- [`cloud-devops-expert`](../cloud-devops-expert/SKILL.md) - Cloud platforms (AWS, GCP, Azure) and Terraform infrastructure

## Iron Laws

1. **ALWAYS** use `docker compose` (V2 plugin) — never use `docker-compose` (V1 standalone), which is deprecated and will be removed.
2. **NEVER** include secrets or credentials directly in compose files or committed `.env` files — use external secret management or `.env.example` templates for documentation only.
3. **ALWAYS** define health checks on services that other services depend on — without health checks, dependent services start before their dependencies are actually ready.
4. **NEVER** expose a service port to the host unless it must be accessed from outside the compose network — unnecessary host port exposure increases attack surface.
5. **ALWAYS** specify resource limits (CPU and memory) on services intended for production — unlimited containers can starve other services and crash the host.

## Anti-Patterns

| Anti-Pattern                                | Why It Fails                                                                        | Correct Approach                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Using `docker-compose` V1 command           | V1 is deprecated; missing V2 features (profiles, merge, watch) and will be removed  | Use `docker compose` (space, not hyphen); verify `docker compose version`                       |
| Hardcoded secrets in compose file           | Secrets committed to git are permanently exposed in history                         | Use environment variable references (`${SECRET}`) loaded from untracked `.env`                  |
| No health checks on database/cache services | App containers start before DB is ready; causes startup race conditions and crashes | Add `healthcheck:` with appropriate test commands; use `depends_on: condition: service_healthy` |
| Exposing all ports to host (`0.0.0.0`)      | Services accessible from any network interface including public interfaces          | Bind to `127.0.0.1` for dev; use internal networks for service-to-service communication         |
| No restart policy                           | Containers stay down after crash or host reboot in production                       | Use `restart: unless-stopped` for services that should auto-recover                             |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
