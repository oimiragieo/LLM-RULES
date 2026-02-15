'use strict';

module.exports = [
  // === Core (7) ===
  {
    id: 1,
    category: 'Core',
    prompt: 'Design the system architecture for migrating our monolith to microservices',
    expectedAgent: 'architect',
    notExpected: 'developer',
  },
  {
    id: 2,
    category: 'Core',
    prompt: 'Fix the null pointer exception in the auth controller getUser method',
    expectedAgent: 'developer',
    notExpected: null,
  },
  {
    id: 3,
    category: 'Core',
    prompt: 'Plan the implementation strategy for adding OAuth2 authentication',
    expectedAgent: 'planner',
    notExpected: 'developer',
  },
  {
    id: 4,
    category: 'Core',
    prompt: 'Write comprehensive test coverage for the payment processing module',
    expectedAgent: 'qa',
    notExpected: 'developer',
  },
  {
    id: 5,
    category: 'Core',
    prompt: 'Create user stories and acceptance criteria for the new checkout feature',
    expectedAgent: 'pm',
    notExpected: 'developer',
  },
  {
    id: 6,
    category: 'Core',
    prompt: 'Update the API documentation for all v2 REST endpoints',
    expectedAgent: 'technical-writer',
    notExpected: 'developer',
  },
  {
    id: 7,
    category: 'Core',
    prompt: 'Summarize and compress the current conversation context',
    expectedAgent: 'context-compressor',
    notExpected: null,
    optional: true, // may not route via standard agent spawn
  },

  // === Review & Quality (3) ===
  {
    id: 8,
    category: 'Review',
    prompt: 'Review the pull request for the new search feature implementation',
    expectedAgent: 'code-reviewer',
    notExpected: 'developer',
  },
  {
    id: 9,
    category: 'Review',
    prompt: 'Refactor the legacy billing module to reduce complexity and improve readability',
    expectedAgent: 'code-simplifier',
    notExpected: 'developer',
  },
  {
    id: 10,
    category: 'Review',
    prompt: 'Perform a security audit of the authentication and authorization system',
    expectedAgent: 'security-architect',
    notExpected: 'developer',
  },

  // === Infrastructure & Ops (4) ===
  {
    id: 11,
    category: 'Infrastructure',
    prompt: 'Set up a CI/CD pipeline with GitHub Actions and Docker deployment',
    expectedAgent: 'devops',
    notExpected: 'developer',
  },
  {
    id: 12,
    category: 'Infrastructure',
    prompt: 'Debug the production memory leak causing OOM crashes in the API server',
    expectedAgent: 'devops-troubleshooter',
    notExpected: 'developer',
  },
  {
    id: 13,
    category: 'Infrastructure',
    prompt: 'Handle the ongoing production outage affecting the payment processing service',
    expectedAgent: 'incident-responder',
    notExpected: 'developer',
  },
  {
    id: 14,
    category: 'Infrastructure',
    prompt: 'Design the database schema for our new multi-tenant SaaS platform',
    expectedAgent: 'database-architect',
    notExpected: 'developer',
  },

  // === Language Specialists (8) ===
  {
    id: 15,
    category: 'Language',
    prompt: 'Build a Python async data processing pipeline using pandas and asyncio',
    expectedAgent: 'python-pro',
    notExpected: 'developer',
  },
  {
    id: 16,
    category: 'Language',
    prompt: 'Create advanced TypeScript generic utility types for the API client SDK',
    expectedAgent: 'typescript-pro',
    notExpected: 'developer',
  },
  {
    id: 17,
    category: 'Language',
    prompt: 'Implement a Go gRPC microservice with concurrent stream processing',
    expectedAgent: 'golang-pro',
    notExpected: 'developer',
  },
  {
    id: 18,
    category: 'Language',
    prompt: 'Build a Rust async file processing system using Tokio and async-std',
    expectedAgent: 'rust-pro',
    notExpected: 'developer',
  },
  {
    id: 19,
    category: 'Language',
    prompt: 'Create a Spring Boot 3 REST API with JPA repositories and Flyway migrations',
    expectedAgent: 'java-pro',
    notExpected: 'developer',
  },
  {
    id: 20,
    category: 'Language',
    prompt: 'Build a Laravel 11 REST API with Eloquent models and Sanctum auth',
    expectedAgent: 'php-pro',
    notExpected: 'developer',
  },
  {
    id: 21,
    category: 'Language',
    prompt: 'Create a NestJS WebSocket gateway with Express middleware integration',
    expectedAgent: 'nodejs-pro',
    notExpected: 'developer',
  },
  {
    id: 22,
    category: 'Language',
    prompt: 'Build a FastAPI async REST API with Pydantic V2 models and SQLAlchemy 2.0',
    expectedAgent: 'fastapi-pro',
    notExpected: 'developer',
  },

  // === Framework Specialists (4) ===
  {
    id: 23,
    category: 'Framework',
    prompt: 'Build a React component library with Radix primitives and Tailwind CSS styling',
    expectedAgent: 'frontend-pro',
    notExpected: 'developer',
  },
  {
    id: 24,
    category: 'Framework',
    prompt: 'Create a Next.js 14 application with React Server Components and Server Actions',
    expectedAgent: 'nextjs-pro',
    notExpected: 'developer',
  },
  {
    id: 25,
    category: 'Framework',
    prompt: 'Build a SvelteKit application with Svelte 5 runes and server-side rendering',
    expectedAgent: 'sveltekit-expert',
    notExpected: 'developer',
  },
  {
    id: 26,
    category: 'Framework',
    prompt: 'Design a GraphQL schema with Apollo Server federation and real-time subscriptions',
    expectedAgent: 'graphql-pro',
    notExpected: 'developer',
  },

  // === Mobile & Desktop (4) ===
  {
    id: 27,
    category: 'Mobile',
    prompt: 'Build an iOS app with SwiftUI navigation and Core Data persistence',
    expectedAgent: 'ios-pro',
    notExpected: 'developer',
  },
  {
    id: 28,
    category: 'Mobile',
    prompt: 'Create an Android app with Jetpack Compose UI and Room database',
    expectedAgent: 'android-pro',
    notExpected: 'developer',
  },
  {
    id: 29,
    category: 'Mobile',
    prompt: 'Build a cross-platform React Native app with Expo and native modules',
    expectedAgent: 'expo-mobile-developer',
    notExpected: 'developer',
  },
  {
    id: 30,
    category: 'Mobile',
    prompt: 'Create a Tauri 2.0 cross-platform desktop app with Rust IPC commands',
    expectedAgent: 'tauri-desktop-developer',
    notExpected: 'developer',
  },

  // === Specialist Domains (5) ===
  {
    id: 31,
    category: 'Domain',
    prompt: 'Build an ETL data pipeline for processing customer analytics with Apache Spark',
    expectedAgent: 'data-engineer',
    notExpected: 'developer',
  },
  {
    id: 32,
    category: 'Domain',
    prompt: 'Train a PyTorch image classification model with MLOps experiment tracking',
    expectedAgent: 'ai-ml-specialist',
    notExpected: 'developer',
  },
  {
    id: 33,
    category: 'Domain',
    prompt: 'Write a Solidity smart contract for a DeFi automated market maker protocol',
    expectedAgent: 'web3-blockchain-expert',
    notExpected: 'developer',
  },
  {
    id: 34,
    category: 'Domain',
    prompt: 'Analyze genomic sequencing data using computational biology pipelines',
    expectedAgent: 'scientific-research-expert',
    notExpected: 'developer',
  },
  {
    id: 35,
    category: 'Domain',
    prompt: 'Implement an ECS-based game physics system in Unity with custom shaders',
    expectedAgent: 'gamedev-pro',
    notExpected: 'developer',
  },

  // === UX & Research (2) ===
  {
    id: 36,
    category: 'UX',
    prompt: 'Review the mobile app design for accessibility compliance and UX best practices',
    expectedAgent: 'mobile-ux-reviewer',
    notExpected: 'developer',
  },
  {
    id: 37,
    category: 'Research',
    prompt: 'Research and compare caching strategies for distributed microservice architectures',
    expectedAgent: 'researcher',
    notExpected: 'developer',
  },

  // === Architecture Docs / C4 (4) ===
  {
    id: 38,
    category: 'C4',
    prompt: 'Create a C4 system context diagram documenting all external system integrations',
    expectedAgent: 'c4-context',
    notExpected: 'developer',
  },
  {
    id: 39,
    category: 'C4',
    prompt: 'Document the C4 container-level deployment architecture with all services',
    expectedAgent: 'c4-container',
    notExpected: 'developer',
  },
  {
    id: 40,
    category: 'C4',
    prompt: 'Create C4 component diagrams showing the auth service internal architecture',
    expectedAgent: 'c4-component',
    notExpected: 'developer',
  },
  {
    id: 41,
    category: 'C4',
    prompt: 'Generate C4 code-level documentation for the API routing module',
    expectedAgent: 'c4-code',
    notExpected: 'developer',
  },

  // === Orchestrators (4) ===
  {
    id: 42,
    category: 'Orchestrator',
    prompt:
      'Coordinate the complete migration from our legacy monolith to microservices architecture across 6 teams',
    expectedAgent: 'master-orchestrator',
    notExpected: 'developer',
  },
  {
    id: 43,
    category: 'Orchestrator',
    prompt: 'The framework needs a new Terraform infrastructure management agent — create it',
    expectedAgent: 'evolution-orchestrator',
    notExpected: 'developer',
  },
  {
    id: 44,
    category: 'Orchestrator',
    prompt:
      'Party mode: have the team discuss and debate the best approach for implementing real-time notifications',
    expectedAgent: 'party-orchestrator',
    notExpected: 'developer',
  },
  {
    id: 45,
    category: 'Orchestrator',
    prompt: 'Run a parallel security scan across all 12 microservice repositories simultaneously',
    expectedAgent: 'swarm-coordinator',
    notExpected: 'developer',
  },

  // === Meta (2) ===
  {
    id: 46,
    category: 'Meta',
    prompt: 'Reflect on our last development session and extract key learnings',
    expectedAgent: 'reflection-agent',
    notExpected: null,
    optional: true, // may be auto-triggered
  },
  {
    id: 47,
    category: 'Meta',
    prompt: 'Validate the project context and verify all Conductor configurations are correct',
    expectedAgent: 'conductor-validator',
    notExpected: null,
  },

  // === Developer Correct Routing (2) ===
  {
    id: 48,
    category: 'Developer-Correct',
    prompt: 'Fix the race condition in the WebSocket connection handler',
    expectedAgent: 'developer',
    notExpected: null,
  },
  {
    id: 49,
    category: 'Developer-Correct',
    prompt: 'Implement the new caching layer for the API response handler',
    expectedAgent: 'developer',
    notExpected: null,
  },
];

