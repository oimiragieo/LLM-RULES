# Docker Development Standards

## Multi-Stage Builds

Always use multi-stage builds to minimize final image size:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Runtime
FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
CMD ["node", "server.js"]
```

## Non-Root User (MANDATORY)

Never run containers as root:

```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

## Layer Caching

Order Dockerfile instructions from least to most frequently changing:

1. Base image
2. System dependencies (`apt-get`, `apk`)
3. Application dependencies (`package.json` + install)
4. Application source code
5. Runtime config

```dockerfile
# GOOD: dependencies cached separately from source
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ ./src/
```

## .dockerignore

Always create `.dockerignore` — exclude everything not needed in the image:

```
node_modules/
.git/
.env
*.log
tests/
docs/
.claude/
```

## No `latest` Tag in Production

Pin image versions explicitly:

```dockerfile
# BAD
FROM node:latest

# GOOD
FROM node:22.5.0-alpine3.20
```

## Health Checks

Define health checks for all long-running services:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

## Environment Variables

- Use `ARG` for build-time variables
- Use `ENV` for runtime variables
- Never bake secrets into images — use runtime env injection or secrets management
- Document all required env vars in README

```dockerfile
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
```

## Image Size

- Prefer `alpine` variants for smaller base images
- Clean package manager cache in the same RUN instruction
- Remove build tools in production stage

```dockerfile
RUN apk add --no-cache git && \
    git clone ... && \
    apk del git
```

## When to Invoke

Apply these standards when writing Dockerfiles. For orchestration, use the `docker-compose` skill. For Kubernetes, use the `kubernetes-specialist` agent.
