# Vercel Deploy Skill Guide

**Comprehensive guide to the Vercel Deploy automation skill for 40+ frameworks.**

---

## Overview

The Vercel Deploy skill (`vercel-deploy`) provides one-command deployment automation for 40+ frameworks with automatic framework detection, configuration, and deployment to Vercel's production infrastructure.

**Key features:**

- One-command deployment automation
- Automatic framework detection (40+ frameworks)
- Production-ready configurations
- Environment variable management
- Preview deployments
- CI/CD integration

**Skill invocation:**

```javascript
Skill({ skill: 'vercel-deploy' });
```

---

## What It Does

The skill automates the entire deployment process:

1. **Framework Detection** - Automatically detects your framework from package.json and file structure
2. **Configuration** - Generates optimal Vercel configuration
3. **Environment Variables** - Guides environment variable setup
4. **Deployment** - Deploys to Vercel production or preview
5. **Status Reporting** - Reports deployment status and URL

**Supported frameworks:** Next.js, React, Vue, Angular, Svelte, SvelteKit, Nuxt, Astro, Remix, Solid, Qwik, Gatsby, Vite, and 27+ more.

---

## Trigger Scenarios

Invoke this skill when:

1. **Production Deployment**

   - "Deploy my app to production"
   - "How do I push this to Vercel"
   - "Deploy to production now"

2. **CI/CD Setup**

   - "Set up CI/CD deployment"
   - "Automate deployments with GitHub Actions"
   - "Configure automatic deployments"

3. **Preview Deployments**

   - "Deploy a preview for this PR"
   - "Create a staging deployment"
   - "Preview deployment for testing"

4. **Framework-Specific Deployment**
   - "Deploy my Next.js app"
   - "Deploy SvelteKit app to Vercel"
   - "How do I deploy React app to Vercel"

---

## Expected Outputs

### 1. Framework Detection

The skill identifies your framework:

```
Framework Detected: Next.js 14
Build Command: next build
Output Directory: .next
Install Command: npm install
```

### 2. Deployment Configuration

Generates optimal configuration:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "framework": "nextjs"
}
```

### 3. Deployment Status

Reports deployment progress:

```
🚀 Deploying to Vercel...
✅ Build successful
✅ Deployment complete
🔗 Production URL: https://your-app.vercel.app
🔗 Preview URL: https://your-app-preview.vercel.app
```

---

## Supported Frameworks

### Frontend Frameworks

| Framework         | Detection                 | Build Command            | Output Dir   |
| ----------------- | ------------------------- | ------------------------ | ------------ |
| Next.js           | next in dependencies      | next build               | .next        |
| React (CRA)       | react-scripts             | react-scripts build      | build        |
| React (Vite)      | vite + react              | vite build               | dist         |
| Vue (Vue CLI)     | @vue/cli-service          | vue-cli-service build    | dist         |
| Vue (Vite)        | vite + vue                | vite build               | dist         |
| Angular           | @angular/cli              | ng build                 | dist/app     |
| Svelte (Vite)     | vite + svelte             | vite build               | dist         |
| SvelteKit         | @sveltejs/kit             | vite build               | build        |
| Solid (Vite)      | vite + solid              | vite build               | dist         |
| Qwik              | @builder.io/qwik          | qwik build               | dist         |
| Astro             | astro                     | astro build              | dist         |
| Remix             | @remix-run/dev            | remix build              | build        |
| Gatsby            | gatsby                    | gatsby build             | public       |
| Nuxt              | nuxt                      | nuxt build               | .output      |
| Preact            | preact-cli                | preact build             | build        |
| Lit               | @lit/react                | npm run build            | dist         |

### Backend Frameworks

| Framework         | Detection                 | Build Command            | Output Dir   |
| ----------------- | ------------------------- | ------------------------ | ------------ |
| Express           | express                   | npm run build            | dist         |
| Fastify           | fastify                   | npm run build            | dist         |
| Koa               | koa                       | npm run build            | dist         |
| Hono              | hono                      | npm run build            | dist         |

### Meta Frameworks

| Framework         | Detection                 | Build Command            | Output Dir   |
| ----------------- | ------------------------- | ------------------------ | ------------ |
| Next.js           | next                      | next build               | .next        |
| SvelteKit         | @sveltejs/kit             | vite build               | build        |
| Nuxt              | nuxt                      | nuxt build               | .output      |
| Remix             | @remix-run/dev            | remix build              | build        |
| Astro             | astro                     | astro build              | dist         |
| SolidStart        | solid-start               | solid-start build        | .output      |
| Analog (Angular)  | @analogjs/platform        | analog build             | dist         |

### Static Site Generators

| Framework         | Detection                 | Build Command            | Output Dir   |
| ----------------- | ------------------------- | ------------------------ | ------------ |
| Gatsby            | gatsby                    | gatsby build             | public       |
| Hugo              | hugo.toml                 | hugo                     | public       |
| Jekyll            | _config.yml               | jekyll build             | _site        |
| Eleventy (11ty)   | @11ty/eleventy            | eleventy                 | _site        |
| VuePress          | vuepress                  | vuepress build           | .vuepress    |
| Docusaurus        | @docusaurus/core          | docusaurus build         | build        |
| Hexo              | hexo                      | hexo generate            | public       |

### Specialized Frameworks

| Framework         | Detection                 | Build Command            | Output Dir   |
| ----------------- | ------------------------- | ------------------------ | ------------ |
| Redwood           | @redwoodjs/core           | redwood build            | web/dist     |
| Blitz             | blitz                     | blitz build              | .next        |
| Hydrogen (Shopify)| @shopify/hydrogen         | shopify hydrogen build   | dist         |

**Total:** 40+ frameworks supported

---

## Framework Detection Process

The skill uses this detection logic:

### 1. Check package.json Dependencies

```typescript
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

// Check dependencies and devDependencies
if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
  return 'nextjs';
}
if (packageJson.dependencies?.['@sveltejs/kit']) {
  return 'sveltekit';
}
// ... (40+ framework checks)
```

### 2. Check File Structure

```typescript
// Check for framework-specific files
if (fs.existsSync('next.config.js') || fs.existsSync('next.config.mjs')) {
  return 'nextjs';
}
if (fs.existsSync('svelte.config.js')) {
  return 'sveltekit';
}
if (fs.existsSync('astro.config.mjs')) {
  return 'astro';
}
```

### 3. Check Build Scripts

```typescript
// Check package.json scripts
if (packageJson.scripts?.build === 'next build') {
  return 'nextjs';
}
if (packageJson.scripts?.build === 'vite build') {
  // Could be React, Vue, Svelte, Solid - check dependencies
}
```

### 4. Confidence Scoring

```typescript
const confidence = {
  nextjs: 0,
  react: 0,
  vue: 0,
};

// Increment confidence scores
if (packageJson.dependencies?.next) confidence.nextjs += 0.8;
if (fs.existsSync('next.config.js')) confidence.nextjs += 0.2;

// Select framework with highest confidence
const framework = Object.keys(confidence).reduce((a, b) =>
  confidence[a] > confidence[b] ? a : b
);
```

---

## Deployment Configuration

### vercel.json (Manual Configuration)

If auto-detection fails, create `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "framework": "vite",
  "env": {
    "API_URL": "@api-url"
  }
}
```

### Environment Variables

**Production:**

```bash
# Set via Vercel CLI
vercel env add API_URL production
# Enter value when prompted
```

**Preview:**

```bash
vercel env add API_URL preview
```

**Development:**

```bash
vercel env add API_URL development
```

**Pull to local:**

```bash
vercel env pull .env.local
```

---

## Deployment Commands

### 1. First-Time Setup

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Link project
vercel link
```

### 2. Preview Deployment

```bash
# Deploy to preview URL
vercel

# Preview URL: https://your-app-preview.vercel.app
```

### 3. Production Deployment

```bash
# Deploy to production
vercel --prod

# Production URL: https://your-app.vercel.app
```

### 4. Custom Domain

```bash
# Add custom domain
vercel domains add yourdomain.com

# Verify DNS
vercel domains inspect yourdomain.com
```

---

## CI/CD Integration

### GitHub Actions

**File:** `.github/workflows/deploy.yml`

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm install

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

**Setup secrets:**

1. Get Vercel token: `vercel login` → Settings → Tokens
2. Get org ID: `vercel whoami` → View org settings
3. Get project ID: `vercel link` → `.vercel/project.json`
4. Add to GitHub: Repository → Settings → Secrets

---

### GitLab CI

**File:** `.gitlab-ci.yml`

```yaml
deploy:
  image: node:18
  stage: deploy
  script:
    - npm install -g vercel
    - vercel --token=$VERCEL_TOKEN --prod
  only:
    - main
```

---

## Performance Impact

**Execution time:** ~1000-3000ms (depends on framework and network)

**Network requirement:** Yes (uploads files to Vercel)

**Deployment time:**

- Small app (< 10 MB): 30-60 seconds
- Medium app (10-50 MB): 1-3 minutes
- Large app (> 50 MB): 3-10 minutes

---

## Code Review Checklist

### Pre-Deployment Checklist

Use this checklist before deploying:

#### 1. Environment Variables Set

```bash
# Check environment variables
vercel env ls

# Should show:
# Production:
#   - API_URL
#   - DATABASE_URL
#   - SECRET_KEY
```

#### 2. Build Command Works Locally

```bash
# Test build locally
npm run build

# Should complete without errors
```

#### 3. Production Configuration Optimized

**Check next.config.js (Next.js):**

```javascript
module.exports = {
  output: 'standalone', // Smaller deployment size
  images: {
    domains: ['cdn.example.com'], // Allowed image domains
  },
  env: {
    API_URL: process.env.API_URL, // Environment variables
  },
};
```

#### 4. Performance Checks Passed

```javascript
// Run performance skills first
Skill({ skill: 'vercel-react-best-practices' }); // Performance
Skill({ skill: 'vercel-web-design-guidelines' }); // Accessibility

// Then deploy
Skill({ skill: 'vercel-deploy' });
```

#### 5. .gitignore Includes Vercel Files

```
# .gitignore
.vercel
.env*.local
```

---

## Troubleshooting

### Issue: Framework Not Detected

**Problem:** `Error: Framework not detected`

**Solutions:**

1. **Add vercel.json manually:**

   ```json
   {
     "framework": "nextjs",
     "buildCommand": "npm run build"
   }
   ```

2. **Check package.json has framework dependency:**

   ```json
   {
     "dependencies": {
       "next": "14.0.0"
     }
   }
   ```

3. **Verify build script exists:**
   ```json
   {
     "scripts": {
       "build": "next build"
     }
   }
   ```

---

### Issue: Build Fails

**Problem:** `Error: Build failed`

**Solutions:**

1. **Test build locally:**

   ```bash
   npm run build
   # Fix any errors locally first
   ```

2. **Check build logs:**

   ```bash
   vercel logs
   # Review error messages
   ```

3. **Verify environment variables:**

   ```bash
   vercel env ls
   # Ensure all required variables are set
   ```

4. **Check Node.js version:**
   ```json
   {
     "engines": {
       "node": "18.x"
     }
   }
   ```

---

### Issue: Deployment Timeout

**Problem:** `Error: Deployment timeout`

**Solutions:**

1. **Reduce bundle size:**

   ```bash
   # Analyze bundle
   ANALYZE=true npm run build

   # Remove unused dependencies
   npm prune
   ```

2. **Optimize build command:**

   ```json
   {
     "buildCommand": "npm run build --max-old-space-size=4096"
   }
   ```

3. **Enable caching:**
   ```json
   {
     "build": {
       "env": {
         "NEXT_PRIVATE_CACHE": "1"
       }
     }
   }
   ```

---

### Issue: Environment Variables Not Working

**Problem:** `Error: Environment variable undefined`

**Solutions:**

1. **Check variable is set:**

   ```bash
   vercel env ls
   ```

2. **Pull variables locally:**

   ```bash
   vercel env pull .env.local
   ```

3. **Verify variable scope:**

   - Production variables only available in production
   - Preview variables only in preview deployments
   - Development variables only in local development

4. **Use correct syntax:**
   ```typescript
   // Server-side (Next.js)
   const apiUrl = process.env.API_URL;

   // Client-side (Next.js) - prefix with NEXT_PUBLIC_
   const publicApiUrl = process.env.NEXT_PUBLIC_API_URL;
   ```

---

## Combined with Other Skills

### Pattern 1: Pre-Deployment Optimization

```javascript
// Step 1: Performance optimization
Skill({ skill: 'vercel-react-best-practices' });

// Step 2: Accessibility audit
Skill({ skill: 'vercel-web-design-guidelines' });

// Step 3: Deploy
Skill({ skill: 'vercel-deploy' });
```

**Result:** Optimized and accessible deployment.

---

## Related Documentation

- [Skill Usage Guide](SKILL_USAGE_GUIDE.md) - Overview of all 5 skills
- [React Performance Skill Guide](REACT_PERFORMANCE_SKILL.md) - Performance optimization
- [React Native Skill Guide](REACT_NATIVE_SKILL.md) - Mobile-specific patterns
- [Composition Patterns Skill Guide](COMPOSITION_PATTERNS_SKILL.md) - Component architecture
- [Web Design Skill Guide](WEB_DESIGN_SKILL.md) - Accessibility and design

---

## Deployment Best Practices

### 1. Use Preview Deployments for Testing

```bash
# Deploy to preview first
vercel

# Test at: https://your-app-preview.vercel.app

# If looks good, deploy to production
vercel --prod
```

### 2. Set Up Automatic Deployments

**GitHub Integration:**

1. Link GitHub repository in Vercel dashboard
2. Enable automatic deployments
3. Every push to `main` deploys to production
4. Every PR creates preview deployment

### 3. Use Environment Variables for Secrets

**Never hardcode secrets:**

```typescript
// BAD
const apiKey = 'sk_live_abc123'; // Hardcoded secret

// GOOD
const apiKey = process.env.API_KEY; // From environment variable
```

### 4. Monitor Deployment Performance

**Vercel Analytics:**

- Enable in dashboard
- Track Core Web Vitals
- Monitor performance over time

**Recommended metrics:**

- Largest Contentful Paint (LCP): < 2.5s
- First Input Delay (FID): < 100ms
- Cumulative Layout Shift (CLS): < 0.1

### 5. Use Edge Functions for Performance

**Edge Functions** (Next.js Middleware):

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  // Runs at the edge (closest to user)
  return NextResponse.redirect('/new-url');
}
```

**Benefits:**

- Faster response times
- Lower latency
- Global distribution

---

## Conclusion

The Vercel Deploy skill provides one-command deployment automation for 40+ frameworks with automatic framework detection and production-ready configurations. Use this skill to deploy your applications to Vercel's global edge network.

**Invoke the skill:**

```javascript
Skill({ skill: 'vercel-deploy' });
```

**Next steps:**

1. Install Vercel CLI: `npm install -g vercel`
2. Login: `vercel login`
3. Link project: `vercel link`
4. Test deployment: `vercel`
5. Deploy to production: `vercel --prod`
6. Set up CI/CD with GitHub Actions
7. Monitor performance with Vercel Analytics
