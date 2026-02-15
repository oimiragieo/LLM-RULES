'use strict';

const DOMAIN_BUCKETS = {
  'react-expert': {
    patterns: [/^react-/, /^shadcn-/, /^radix-/],
    description:
      'React ecosystem expert including hooks, state management, component patterns, Shadcn UI, and Radix primitives',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'angular-expert': {
    patterns: [/^angular-/, /^novo-elements-/],
    description:
      'Angular framework expert including components, services, RxJS, templates, and testing',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'vue-expert': {
    patterns: [/^vue-/, /^nuxt-/, /^pinia-/],
    description: 'Vue.js ecosystem expert including Vue 3, Composition API, Nuxt, and Pinia',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'svelte-expert': {
    patterns: [/^svelte-/, /^sveltekit-/],
    description: 'Svelte and SvelteKit expert including components, stores, and routing',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'astro-expert': {
    patterns: [/^astro-/],
    description:
      'Astro framework expert including components, content collections, and integrations',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'nextjs-expert': {
    patterns: [/^next-/, /^nextjs-/],
    description: 'Next.js framework expert including App Router, Server Components, and API routes',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'solidjs-expert': {
    patterns: [/^solidjs-/, /^solid-/],
    description: 'SolidJS expert including reactivity, components, and store patterns',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'qwik-expert': {
    patterns: [/^qwik-/],
    description: 'Qwik framework expert including resumability, lazy loading, and optimization',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'android-expert': {
    patterns: [/^android-/, /^jetpack-/, /^kotlin-/],
    description:
      'Android development expert including Jetpack Compose, Kotlin, and Material Design',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'flutter-expert': {
    patterns: [/^flutter-/, /^dart-/],
    description:
      'Flutter and Dart expert including widgets, state management, and platform integration',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'ios-expert': {
    patterns: [/^ios-/, /^swift-/, /^swiftui-/],
    description: 'iOS development expert including SwiftUI, UIKit, and Apple frameworks',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'python-backend-expert': {
    patterns: [
      /^python-/,
      /^django-/,
      /^fastapi-/,
      /^flask-/,
      /^pydantic-/,
      /^sqlalchemy-/,
      /^alembic-/,
    ],
    description:
      'Python backend expert including Django, FastAPI, Flask, SQLAlchemy, and async patterns',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'go-expert': {
    patterns: [/^go-/, /^golang-/, /^grpc-/],
    description: 'Go programming expert including APIs, gRPC, concurrency, and best practices',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'nodejs-expert': {
    patterns: [/^node-/, /^nodejs-/, /^express-/, /^nestjs-/, /^nest-/],
    description: 'Node.js backend expert including Express, NestJS, and async patterns',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'java-expert': {
    patterns: [/^java-/, /^spring-/, /^springboot-/],
    description: 'Java and Spring Boot expert including REST APIs, JPA, and microservices',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'rust-expert': {
    patterns: [/^rust-/, /^cargo-/, /^tokio-/],
    description: 'Rust programming expert including async, ownership, and systems programming',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'graphql-expert': {
    patterns: [/^graphql-/, /^apollo-/],
    description: 'GraphQL expert including schema design, Apollo Client/Server, and caching',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'database-expert': {
    patterns: [/^prisma-/, /^supabase-/, /^database-/, /^sql-/, /^mongodb-/, /^postgres-/],
    description: 'Database expert including Prisma, Supabase, SQL, and NoSQL patterns',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'cloud-devops-expert': {
    patterns: [/^aws-/, /^gcp-/, /^azure-/, /^terraform-/, /^cloudflare-/],
    description: 'Cloud and DevOps expert including AWS, GCP, Azure, and Terraform',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'container-expert': {
    patterns: [/^docker-/, /^kubernetes-/, /^k8s-/, /^helm-/, /^knative-/, /^istio-/],
    description:
      'Container orchestration expert including Docker, Kubernetes, Helm, and service mesh',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'testing-expert': {
    patterns: [
      /^cypress-/,
      /^jest-/,
      /^vitest-/,
      /^playwright-/,
      /^selenium-/,
      /^testing-/,
      /^test-/,
    ],
    description:
      'Testing expert including unit tests, E2E, integration, and test-driven development',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'styling-expert': {
    patterns: [/^tailwind-/, /^css-/, /^sass-/, /^styled-/, /^emotion-/],
    description: 'CSS and styling expert including Tailwind, CSS-in-JS, and responsive design',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'ui-components-expert': {
    patterns: [/^chakra-/, /^material-/, /^mantine-/, /^ant-/, /^bootstrap-/],
    description: 'UI component library expert including Chakra, Material UI, and Mantine',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'typescript-expert': {
    patterns: [/^typescript-/, /^javascript-/, /^es-module-/, /^esm-/],
    description: 'TypeScript and JavaScript expert including type systems, patterns, and tooling',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'htmx-expert': {
    patterns: [/^htmx-/],
    description: 'HTMX expert including hypermedia patterns, Django/Flask integration',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'code-quality-expert': {
    patterns: [
      /^clean-code/,
      /^code-style/,
      /^code-quality/,
      /^coding-guidelines/,
      /^refactoring-/,
      /^linting-/,
    ],
    description: 'Code quality expert including clean code, style guides, and refactoring',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'cpp-expert': {
    patterns: [/^cpp-/, /^c\+\+-/, /^cmake-/],
    description: 'C/C++ programming expert including modern C++, CMake, and systems programming',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'elixir-expert': {
    patterns: [/^elixir-/, /^phoenix-/, /^ecto-/],
    description: 'Elixir and Phoenix expert including OTP, Ecto, and functional programming',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'chrome-extension-expert': {
    patterns: [/^chrome-extension-/, /^browser-extension-/, /^extension-/],
    description: 'Browser extension expert including Chrome APIs, manifest, and security',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'gamedev-expert': {
    patterns: [/^dragonruby-/, /^game-/, /^unity-/, /^godot-/],
    description: 'Game development expert including DragonRuby, Unity, and game mechanics',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'ai-ml-expert': {
    patterns: [/^ai-/, /^ml-/, /^pytorch-/, /^tensorflow-/, /^langchain-/, /^llm-/, /^chemistry-/],
    description:
      'AI and ML expert including PyTorch, LangChain, LLM integration, and scientific computing',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch'],
  },
  'php-expert': {
    patterns: [/^php-/, /^laravel-/, /^wordpress-/, /^drupal-/],
    description: 'PHP expert including Laravel, WordPress, and Drupal development',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'web3-expert': {
    patterns: [/^solidity-/, /^web3-/, /^ethereum-/, /^blockchain-/, /^cairo-/, /^hardhat-/],
    description: 'Web3 and blockchain expert including Solidity, Ethereum, and smart contracts',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'state-management-expert': {
    patterns: [/^mobx-/, /^redux-/, /^zustand-/, /^jotai-/, /^recoil-/],
    description: 'State management expert including MobX, Redux, Zustand, and reactive patterns',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'general-best-practices': {
    patterns: [
      /^general-/,
      /^project-/,
      /^documentation-/,
      /^naming-/,
      /^error-handling-/,
      /^performance-/,
      /^security-/,
      /^accessibility-/,
    ],
    description:
      'General software development best practices including naming, error handling, documentation, and security',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'assistant-behavior-rules': {
    patterns: [/^no-/, /^assistant-/, /^response-/, /^clarification-/],
    description:
      'AI assistant behavior rules including response formatting and interaction patterns',
    tools: ['Read', 'Write', 'Edit'],
  },
  'api-development-expert': {
    patterns: [/^api-/, /^rest-/, /^openapi-/, /^swagger-/],
    description: 'API development expert including REST design, OpenAPI, and documentation',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'frontend-expert': {
    patterns: [/^frontend-/, /^ui-/, /^ux-/, /^responsive-/, /^web-/],
    description:
      'Frontend development expert including UI/UX patterns, responsive design, and accessibility',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'backend-expert': {
    patterns: [/^backend-/, /^server-/, /^middleware-/],
    description:
      'Backend development expert including server architecture, middleware, and data handling',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'build-tools-expert': {
    patterns: [/^webpack-/, /^vite-/, /^esbuild-/, /^rollup-/, /^turbo-/, /^biome-/],
    description: 'Build tools expert including Vite, Webpack, and bundler configuration',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'data-expert': {
    patterns: [/^data-/, /^csv-/, /^json-/, /^xml-/, /^parsing-/],
    description: 'Data processing expert including parsing, transformation, and validation',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'auth-security-expert': {
    patterns: [/^auth-/, /^oauth-/, /^jwt-/, /^bcrypt-/, /^encryption-/],
    description: 'Authentication and security expert including OAuth, JWT, and encryption',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'cms-expert': {
    patterns: [/^cms-/, /^contentful-/, /^sanity-/, /^strapi-/],
    description: 'CMS expert including headless CMS integration and content management',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'ruby-expert': {
    patterns: [/^ruby-/, /^rails-/, /^sinatra-/],
    description: 'Ruby and Rails expert including ActiveRecord, Gems, and best practices',
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
};

const PROTECTED_SKILLS = [
  'skill-creator',
  'agent-creator',
  'diagram-generator',
  'doc-generator',
  'test-generator',
  'tdd',
  'computer-use',
  'aws-cloud-ops',
  'docker-compose',
  'gcloud-cli',
  'kubernetes-flux',
  'terraform-infra',
  'code-analyzer',
  'code-style-validator',
  'commit-validator',
  'debugging',
  'git-expert',
  'github-mcp',
  'github-ops',
  'incident-runbook-templates',
  'jira-pm',
  'linear-pm',
  'on-call-handoff-patterns',
  'postmortem-writing',
  'mcp-converter',
  'project-analyzer',
  'repo-rag',
  'sentry-monitoring',
  'sequential-thinking',
  'slack-notifications',
  'smart-debug',
  'swarm',
  'text-to-sql',
  'tool-search',
  'security-architect',
  'database-architect',
  'architecture-review',
  'context-compressor',
  'swarm-coordination',
  'consensus-voting',
  'plan-generator',
  'dependency-analyzer',
  'rule-auditor',
  'response-rater',
  'filesystem',
  'explaining-rules',
  'artifact-publisher',
  'recovery',
];

module.exports = {
  DOMAIN_BUCKETS,
  PROTECTED_SKILLS,
};
