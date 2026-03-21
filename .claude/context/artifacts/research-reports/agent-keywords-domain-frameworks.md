# Domain Framework Agent Keywords Research Report

**Generated:** 2026-01-25
**Research Method:** Web search via Exa API
**Purpose:** Extract intent keywords for router matching to domain framework agents

---

## 1. fastapi-pro (FastAPI Python APIs)

### Framework-Specific Terminology
- FastAPI, Pydantic, async/await, ASGI, Starlette
- Type hints, BaseModel, Field validation
- Path operations, dependency injection
- OpenAPI, Swagger UI, ReDoc
- Background tasks, middleware

### Common Features & Patterns
- Async API endpoints, non-blocking I/O
- Pydantic models, data validation
- Custom validators, field validators, model validators
- Nested models, type coercion
- Request/response models
- Dependency injection patterns
- OAuth2, JWT authentication
- CORS middleware, rate limiting
- Microservices architecture

### Problem Types This Framework Solves
- High-performance API development
- Data validation and serialization
- Async database operations
- Real-time API endpoints
- Microservices communication
- API documentation generation
- Type-safe request handling

### Ecosystem Keywords
- Pydantic v2, SQLAlchemy, Alembic
- Uvicorn, Gunicorn, Hypercorn
- pytest, httpx, TestClient
- Redis, Celery, RabbitMQ
- Docker, Kubernetes
- PostgreSQL, MongoDB async drivers

### Intent Keywords for Router Matching
```
Primary: fastapi, pydantic, async api, python api, starlette
Secondary: openapi, swagger, type hints, dependency injection, async python
Problem-based: api validation, python microservices, async endpoints, rest api python
Feature-based: pydantic models, field validation, background tasks, oauth2 python
```

---

## 2. nextjs-pro (Next.js React Framework)

### Framework-Specific Terminology
- Next.js, App Router, Pages Router
- Server Components, Client Components
- Server Actions, use server directive
- React Server Components (RSC)
- Streaming, Suspense, loading.tsx
- Metadata API, generateMetadata

### Common Features & Patterns
- File-based routing, dynamic routes
- Server-side rendering (SSR), Static Site Generation (SSG)
- Incremental Static Regeneration (ISR)
- Data fetching in Server Components
- Form handling with Server Actions
- Route Handlers (API routes)
- Middleware, Edge Runtime
- Image optimization, font optimization

### Problem Types This Framework Solves
- Full-stack React applications
- SEO-optimized web apps
- Hybrid static/dynamic rendering
- API route development
- Authentication flows
- Data mutations with forms
- Performance optimization

### Ecosystem Keywords
- Vercel, Edge Functions
- React 18+, TypeScript
- Tailwind CSS, shadcn/ui
- Prisma, Drizzle ORM
- NextAuth.js, Clerk
- tRPC, Tanstack Query
- Turbopack, Webpack

### Intent Keywords for Router Matching
```
Primary: nextjs, next.js, app router, server components, react ssr
Secondary: server actions, use server, rsc, pages router, vercel
Problem-based: react seo, full-stack react, ssr react, static generation
Feature-based: server rendering, streaming, suspense, metadata, isr
```

---

## 3. sveltekit-expert (SvelteKit/Svelte 5)

### Framework-Specific Terminology
- SvelteKit, Svelte 5, Runes
- $state, $derived, $effect, $props, $bindable
- Fine-grained reactivity, signals
- Compile-time framework
- .svelte files, +page.svelte, +layout.svelte

### Common Features & Patterns
- Runes-based reactivity system
- Universal reactivity (works in .js/.ts files)
- Deeply nested reactivity
- Form actions, load functions
- Server-side rendering
- Adapter system (node, vercel, static)
- Preprocessors, TypeScript support

### Problem Types This Framework Solves
- Reactive UI development
- State management without stores
- Lightweight web applications
- Form handling and validation
- Progressive enhancement
- Universal/isomorphic apps

### Ecosystem Keywords
- Vite, Rollup
- Tailwind CSS, Skeleton UI
- Superforms, Zod validation
- Prisma, Drizzle
- Lucia Auth
- Paraglide (i18n)

### Intent Keywords for Router Matching
```
Primary: svelte, sveltekit, svelte 5, runes, svelte reactivity
Secondary: $state, $derived, $effect, svelte components, svelte stores
Problem-based: svelte state management, svelte forms, svelte ssr
Feature-based: fine-grained reactivity, svelte actions, svelte load, svelte adapter
```

---

## 4. nodejs-pro (Node.js/Express/NestJS)

### Framework-Specific Terminology
- Node.js, Express.js, NestJS
- Middleware, routing, controllers
- Decorators, modules, providers (NestJS)
- Event loop, non-blocking I/O
- CommonJS, ES Modules

### Common Features & Patterns
- RESTful API development
- Middleware chains, error handling
- Dependency injection (NestJS)
- Guards, interceptors, pipes (NestJS)
- Module-based architecture
- Request/response lifecycle
- WebSocket support, real-time

### Problem Types This Framework Solves
- Backend API development
- Microservices architecture
- Real-time applications
- API gateway development
- Enterprise backend systems
- Scalable server applications

### Ecosystem Keywords
- npm, yarn, pnpm
- TypeScript, JavaScript
- Prisma, TypeORM, Sequelize
- Passport.js, JWT
- Socket.io, ws
- Bull, Agenda (job queues)
- Jest, Mocha, Supertest

### Intent Keywords for Router Matching
```
Primary: nodejs, node.js, express, expressjs, nestjs, nest.js
Secondary: node backend, node api, express middleware, nest modules
Problem-based: node microservices, scalable node, enterprise node, node rest api
Feature-based: express routing, nest controllers, node websocket, node middleware
```

---

## 5. expo-mobile-developer (Expo/React Native)

### Framework-Specific Terminology
- Expo, React Native, Expo SDK
- Expo Go, EAS (Expo Application Services)
- Metro bundler, Hermes engine
- Native modules, Expo Modules API
- Config plugins, app.json/app.config.js

### Common Features & Patterns
- Cross-platform mobile development (iOS/Android)
- File-based routing (Expo Router)
- Universal libraries, platform-specific code
- Push notifications, deep linking
- Camera, file system, sensors access
- Over-the-air updates (EAS Update)
- Build and submit (EAS Build, EAS Submit)

### Problem Types This Framework Solves
- Mobile app development
- Cross-platform apps from single codebase
- Rapid mobile prototyping
- App store deployment
- Native feature access
- Mobile UI development

### Ecosystem Keywords
- React Navigation, Expo Router
- NativeWind, Tamagui, React Native Paper
- AsyncStorage, SecureStore
- Expo Camera, Expo Location
- React Native Reanimated, Gesture Handler
- Firebase, Supabase mobile SDKs

### Intent Keywords for Router Matching
```
Primary: expo, react native, expo sdk, mobile app, cross-platform mobile
Secondary: expo router, eas build, expo go, native modules, expo config
Problem-based: ios android app, mobile development, app store deploy, mobile ui
Feature-based: push notifications, deep linking, expo camera, mobile navigation
```

---

## 6. tauri-desktop-developer (Tauri Desktop Apps)

### Framework-Specific Terminology
- Tauri, Tauri 2.0, tauri.conf.json
- Rust backend, WebView frontend
- Commands, events, IPC
- Window management, system tray
- Sidecar, external binaries
- Plugins, permissions

### Common Features & Patterns
- Cross-platform desktop apps (Windows, macOS, Linux)
- Rust + Web frontend (any framework)
- Small bundle sizes (no Chromium)
- Native system access via Rust
- Auto-updater, installer creation
- Security-first architecture
- Mobile support (Android, iOS) in v2

### Problem Types This Framework Solves
- Desktop application development
- Lightweight desktop apps
- Secure desktop software
- Cross-platform desktop from web stack
- System integration apps
- Electron alternative

### Ecosystem Keywords
- Rust, Cargo
- React, Vue, Svelte, Solid (frontends)
- WebView2 (Windows), WKWebView (macOS)
- tauri-plugin-* ecosystem
- Vite, Webpack bundlers

### Intent Keywords for Router Matching
```
Primary: tauri, desktop app, rust desktop, cross-platform desktop
Secondary: tauri 2, tauri commands, tauri plugins, webview app
Problem-based: electron alternative, lightweight desktop, secure desktop app
Feature-based: system tray, auto updater, native rust, desktop window, tauri ipc
```

---

## 7. ios-pro (iOS/Swift Development)

### Framework-Specific Terminology
- Swift, SwiftUI, UIKit
- Xcode, iOS SDK, watchOS, tvOS
- async/await, structured concurrency
- Actors, Task, MainActor
- Combine framework, publishers/subscribers
- Core Data, SwiftData

### Common Features & Patterns
- Declarative UI with SwiftUI
- State management (@State, @Binding, @Observable)
- Concurrency with async/await
- MVVM architecture pattern
- Navigation (NavigationStack, NavigationPath)
- App lifecycle, scene management
- Widget development, App Clips

### Problem Types This Framework Solves
- iOS app development
- Apple ecosystem apps
- Native mobile UI
- Async data fetching
- Local data persistence
- Push notifications
- In-app purchases

### Ecosystem Keywords
- Xcode, Swift Package Manager (SPM)
- TestFlight, App Store Connect
- Alamofire, Moya (networking)
- Realm, Core Data, SwiftData
- Firebase iOS SDK
- XCTest, XCUITest

### Intent Keywords for Router Matching
```
Primary: ios, swift, swiftui, uikit, xcode, apple development
Secondary: ios app, swift concurrency, swift async, swiftdata, combine
Problem-based: iphone app, ios development, apple watch app, ios ui
Feature-based: swiftui views, ios navigation, core data, swift actors, ios widgets
```

---

## 8. graphql-pro (GraphQL APIs)

### Framework-Specific Terminology
- GraphQL, schema, types
- Query, Mutation, Subscription
- Resolvers, field resolvers
- SDL (Schema Definition Language)
- Introspection, fragments
- Directives, input types

### Common Features & Patterns
- Schema-first or code-first design
- Type system (scalar, object, enum, union, interface)
- Resolver functions, context
- DataLoader for N+1 prevention
- Pagination (cursor-based, offset)
- Authentication/authorization in resolvers
- Real-time with subscriptions
- Federation for microservices

### Problem Types This Framework Solves
- Flexible API design
- Over-fetching/under-fetching prevention
- API evolution without versioning
- Real-time data updates
- Microservices API gateway
- Mobile-optimized APIs
- Type-safe API contracts

### Ecosystem Keywords
- Apollo Server, Apollo Client
- GraphQL Yoga, Mercurius
- Prisma, Nexus, TypeGraphQL
- GraphQL Code Generator
- Relay, urql
- GraphQL Playground, GraphiQL
- Federation, Apollo Router

### Intent Keywords for Router Matching
```
Primary: graphql, graphql api, graphql schema, apollo, graphql server
Secondary: resolvers, mutations, subscriptions, graphql types, sdl
Problem-based: graphql n+1, graphql pagination, graphql auth, api gateway graphql
Feature-based: graphql federation, dataloader, graphql subscriptions, schema design
```

---

## Summary: Router Intent Keyword Matrix

| Agent | Primary Keywords | Secondary Keywords |
|-------|-----------------|-------------------|
| fastapi-pro | fastapi, pydantic, async api, python api | openapi, dependency injection, async python |
| nextjs-pro | nextjs, app router, server components | server actions, rsc, vercel, react ssr |
| sveltekit-expert | svelte, sveltekit, svelte 5, runes | $state, $derived, svelte reactivity |
| nodejs-pro | nodejs, express, nestjs | node backend, nest modules, express middleware |
| expo-mobile-developer | expo, react native, mobile app | expo router, eas build, cross-platform |
| tauri-desktop-developer | tauri, desktop app, rust desktop | tauri commands, electron alternative |
| ios-pro | ios, swift, swiftui, xcode | swift concurrency, swiftdata, ios app |
| graphql-pro | graphql, apollo, resolvers | mutations, subscriptions, schema, federation |

---

## Research Sources

1. FastAPI Official Documentation - https://fastapi.tiangolo.com/
2. Neon Guides - FastAPI Async - https://neon.com/guides/fastapi-async
3. Next.js Documentation - https://nextjs.org/docs/
4. Vercel Blog - What's new in Svelte 5 - https://vercel.com/blog/whats-new-in-svelte-5
5. Svelte Documentation - https://svelte.dev/docs/
6. NestJS Official - https://nestjs.com/
7. Expo Documentation - https://docs.expo.dev/
8. Tauri Documentation - https://v2.tauri.app/
9. Apple Developer - SwiftUI Concurrency - https://developer.apple.com/
10. GraphQL Official - https://graphql.org/learn/
11. Apollo GraphQL Docs - https://www.apollographql.com/docs/
