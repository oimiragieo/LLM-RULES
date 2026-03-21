# Agent Keywords Research: Domain Language Agents

**Generated**: 2026-01-25
**Research Sources**: WebSearch (12 queries)
**Purpose**: Intent keyword extraction for Router agent selection

---

## Agent: python-pro

### High-Confidence Keywords
- `python`, `py`, `.py`, `.pyx`, `.pyi`
- `django`, `flask`, `fastapi`
- `pandas`, `numpy`, `scipy`
- `pip`, `poetry`, `pipenv`, `uv`
- `pytest`, `unittest`, `tox`
- `asyncio`, `async`, `await`
- `virtualenv`, `venv`, `conda`
- `pyproject.toml`, `requirements.txt`

### Medium-Confidence Keywords
- `type hints`, `typing`, `mypy`
- `pydantic`, `dataclasses`
- `sqlalchemy`, `alembic`
- `celery`, `redis`, `rabbitmq`
- `jupyter`, `notebook`, `.ipynb`
- `machine learning`, `ml`, `ai`
- `tensorflow`, `pytorch`, `keras`
- `data science`, `data analysis`

### Ecosystem Keywords
- **Package Managers**: pip, poetry, pipenv, uv, conda
- **Build Tools**: setuptools, wheel, build, hatch, pdm, rye
- **Testing**: pytest, unittest, tox, coverage, hypothesis
- **Linting**: ruff, flake8, pylint, black, isort
- **Type Checking**: mypy, pyright, pyre

### Framework-Specific Triggers
| Framework | Keywords |
|-----------|----------|
| Django | `django`, `orm`, `migrations`, `admin`, `drf`, `rest framework` |
| Flask | `flask`, `jinja2`, `werkzeug`, `blueprint` |
| FastAPI | `fastapi`, `pydantic`, `uvicorn`, `starlette`, `openapi` |
| Data Science | `pandas`, `numpy`, `matplotlib`, `seaborn`, `scikit-learn` |

---

## Agent: rust-pro

### High-Confidence Keywords
- `rust`, `rustlang`, `.rs`
- `cargo`, `crates.io`, `crate`
- `tokio`, `async-std`
- `ownership`, `borrowing`, `lifetimes`
- `rustc`, `rustup`
- `cargo.toml`, `cargo.lock`
- `no_std`, `embedded`

### Medium-Confidence Keywords
- `memory safety`, `zero-cost abstractions`
- `futures`, `async/await`
- `traits`, `generics`, `macros`
- `unsafe`, `ffi`
- `wasm`, `webassembly`
- `actix`, `axum`, `rocket`
- `serde`, `serialization`
- `systems programming`

### Ecosystem Keywords
- **Package Manager**: cargo, crates.io
- **Build Tools**: cargo build, cargo check, cargo clippy
- **Testing**: cargo test, proptest, quickcheck
- **Linting/Formatting**: clippy, rustfmt
- **Documentation**: rustdoc, cargo doc

### Framework-Specific Triggers
| Framework | Keywords |
|-----------|----------|
| Tokio | `tokio`, `async runtime`, `async io`, `spawn`, `select` |
| Actix | `actix`, `actix-web`, `actor model` |
| Axum | `axum`, `tower`, `hyper` |
| Embedded | `embedded-hal`, `cortex-m`, `no_std`, `bare metal` |

---

## Agent: golang-pro

### High-Confidence Keywords
- `go`, `golang`, `.go`
- `go.mod`, `go.sum`
- `goroutine`, `goroutines`
- `channel`, `channels`
- `gin`, `echo`, `fiber`
- `go mod`, `go get`
- `gofmt`, `go fmt`

### Medium-Confidence Keywords
- `concurrency`, `parallelism`
- `interface`, `struct`
- `defer`, `panic`, `recover`
- `context`, `context.Context`
- `microservices`, `grpc`
- `kubernetes`, `docker`, `k8s`
- `statically typed`, `compiled`
- `net/http`, `http handler`

### Ecosystem Keywords
- **Package Manager**: go modules, go mod, go get
- **Build Tools**: go build, go install, go run
- **Testing**: go test, testify, gomock, ginkgo
- **Linting**: golangci-lint, staticcheck, go vet
- **Formatting**: gofmt, goimports

### Framework-Specific Triggers
| Framework | Keywords |
|-----------|----------|
| Gin | `gin`, `gin-gonic`, `rest api`, `router` |
| Echo | `echo`, `labstack`, `middleware` |
| Fiber | `fiber`, `gofiber`, `fasthttp` |
| gRPC | `grpc`, `protobuf`, `proto`, `protocol buffers` |
| Go Kit | `go-kit`, `microservices toolkit` |

---

## Agent: typescript-pro

### High-Confidence Keywords
- `typescript`, `ts`, `.ts`, `.tsx`
- `type`, `interface`, `generics`
- `npm`, `yarn`, `pnpm`, `bun`
- `tsconfig`, `tsconfig.json`
- `jest`, `vitest`
- `eslint`, `prettier`
- `tsc`, `ts-node`, `tsx`

### Medium-Confidence Keywords
- `type safety`, `type inference`
- `union types`, `intersection types`
- `utility types`, `Pick`, `Omit`, `Partial`
- `decorators`, `metadata`
- `enum`, `const`, `readonly`
- `strict mode`, `strictNullChecks`
- `module`, `namespace`
- `declaration files`, `.d.ts`

### Ecosystem Keywords
- **Package Managers**: npm, yarn, pnpm, bun
- **Build Tools**: tsc, esbuild, swc, rollup, webpack, vite
- **Testing**: jest, vitest, mocha, cypress, playwright
- **Linting**: eslint, typescript-eslint, biome
- **Formatting**: prettier, biome

### Framework-Specific Triggers
| Framework | Keywords |
|-----------|----------|
| React | `react`, `jsx`, `tsx`, `hooks`, `component`, `useState`, `useEffect` |
| Angular | `angular`, `decorator`, `rxjs`, `observable`, `injection` |
| Node.js | `node`, `express`, `nestjs`, `fastify`, `koa` |
| Next.js | `nextjs`, `next`, `ssr`, `ssg`, `app router` |
| Vue | `vue`, `composition api`, `pinia`, `nuxt` |

---

## Agent: java-pro

### High-Confidence Keywords
- `java`, `.java`, `jdk`, `jre`
- `spring`, `spring boot`, `springboot`
- `maven`, `gradle`
- `jpa`, `hibernate`
- `pom.xml`, `build.gradle`
- `junit`, `mockito`
- `jar`, `war`

### Medium-Confidence Keywords
- `enterprise`, `jakarta ee`, `j2ee`
- `microservices`, `spring cloud`
- `beans`, `dependency injection`, `ioc`
- `annotations`, `@autowired`, `@component`
- `jdbc`, `datasource`, `connection pool`
- `servlet`, `filter`, `controller`
- `streams`, `lambda`, `optional`
- `concurrency`, `threads`, `executors`

### Ecosystem Keywords
- **Build Tools**: maven, gradle, ant
- **Testing**: junit, junit5, mockito, testng, assertj
- **Linting/Analysis**: checkstyle, spotbugs, pmd, sonarqube
- **Frameworks**: spring, spring boot, quarkus, micronaut
- **ORM**: hibernate, jpa, mybatis

### Framework-Specific Triggers
| Framework | Keywords |
|-----------|----------|
| Spring Boot | `@SpringBootApplication`, `@RestController`, `@Service`, `actuator` |
| Spring Data | `@Repository`, `JpaRepository`, `CrudRepository`, `findBy` |
| Spring Security | `@EnableWebSecurity`, `SecurityFilterChain`, `authentication` |
| Hibernate | `@Entity`, `@Table`, `@Column`, `SessionFactory`, `EntityManager` |

---

## Agent: php-pro

### High-Confidence Keywords
- `php`, `.php`, `php8`
- `laravel`, `symfony`
- `composer`, `composer.json`
- `eloquent`, `doctrine`
- `blade`, `twig`
- `artisan`, `console`
- `phpunit`, `pest`

### Medium-Confidence Keywords
- `psr`, `psr-4`, `autoloading`
- `namespace`, `use`
- `middleware`, `controller`, `model`
- `migration`, `seeder`, `factory`
- `queue`, `job`, `event`
- `api`, `resource`, `route`
- `orm`, `active record`
- `trait`, `interface`, `abstract`

### Ecosystem Keywords
- **Package Manager**: composer, packagist
- **Build/Task Tools**: artisan, symfony console, phinx
- **Testing**: phpunit, pest, codeception, mockery
- **Static Analysis**: phpstan, psalm, phan
- **Code Style**: php-cs-fixer, phpcs, phpcbf

### Framework-Specific Triggers
| Framework | Keywords |
|-----------|----------|
| Laravel | `eloquent`, `blade`, `artisan`, `facade`, `service provider`, `middleware` |
| Symfony | `doctrine`, `twig`, `bundle`, `service container`, `event dispatcher` |
| WordPress | `wp`, `plugin`, `theme`, `hook`, `action`, `filter`, `shortcode` |
| Drupal | `drupal`, `module`, `entity`, `node`, `taxonomy` |

---

## Cross-Language Disambiguation Matrix

| Keyword | Primary Agent | Disambiguation Rule |
|---------|--------------|---------------------|
| `async` | Check context | Python: asyncio, Rust: tokio, JS/TS: Promise |
| `interface` | Check syntax | Go: implicit, TS/Java: explicit, PHP: with implements |
| `generics` | Check syntax | Rust: `<T>`, TS/Java: `<T>`, Go: `[T any]` |
| `test` | Check framework | pytest/go test/jest/junit/phpunit |
| `orm` | Check framework | SQLAlchemy/GORM/Prisma/Hibernate/Eloquent |
| `api` | Check framework | FastAPI/Gin/Express/Spring/Laravel |
| `migration` | Check context | Django/Laravel/Rails/Prisma/Flyway |

---

## Confidence Scoring Rules

### High Confidence (0.9+)
- Language name explicitly mentioned
- Language-specific file extension (.py, .rs, .go, .ts, .java, .php)
- Framework unique to language (Django, Cargo, Gin, etc.)
- Language-specific package manager command

### Medium Confidence (0.6-0.9)
- Framework mentioned without language context
- Generic programming concept with language hint
- Build tool or testing framework mentioned
- IDE or tooling specific to language ecosystem

### Low Confidence (0.3-0.6)
- Generic programming concepts (async, api, test)
- Shared terminology across languages
- Ambiguous framework names

---

## Sources

### Python Research
- [JetBrains PyCharm Blog - Popular Python Frameworks 2025](https://blog.jetbrains.com/pycharm/2025/09/the-most-popular-python-frameworks-and-libraries-in-2025-2/)
- [Tryolabs - Top Python Libraries 2025](https://tryolabs.com/blog/top-python-libraries-2025)
- [Poetry vs uv Comparison](https://medium.com/@hitorunajp/poetry-vs-uv-which-python-package-manager-should-you-use-in-2025-4212cb5e0a14)

### Rust Research
- [The New Stack - Async Programming in Rust](https://thenewstack.io/async-programming-in-rust-understanding-futures-and-tokio/)
- [Tokio Runtime Documentation](https://tokio.rs/tokio/tutorial)
- [DEV Community - Top 5 Rust Frameworks 2025](https://dev.to/masteringbackend/top-5-rust-frameworks-2025-3jnc)

### Go Research
- [JetBrains GoLand Blog - Go Ecosystem 2025](https://blog.jetbrains.com/go/2025/11/10/go-language-trends-ecosystem-2025/)
- [AsyncSquad Labs - Go Microservices Best Practices](https://asyncsquadlabs.com/blog/microservices-go-best-practices/)
- [LogRocket - Building Microservices with Gin](https://blog.logrocket.com/building-microservices-go-gin/)

### TypeScript Research
- [TypeScript World - Mastering Generics](https://typescriptworld.com/mastering-typescript-generics-a-comprehensive-guide-to-reusable-type-safe-code)
- [DEV Community - TypeScript Roadmap 2025](https://dev.to/sovannaro/typescript-roadmap-2025-47lb)
- [GeeksforGeeks - TypeScript with React 2025](https://www.geeksforgeeks.org/typescript/compelling-reasons-to-use-typescript-with-react-a-developers-guide/)

### Java Research
- [Java Guides - Spring Boot Microservices Roadmap 2026](https://www.javaguides.net/2025/12/spring-boot-microservices-roadmap-2026.html)
- [TheLinuxCode - Spring Boot + Hibernate + JPA Guide](https://thelinuxcode.com/spring-boot-hibernate-jpa-production-integration-guide-2026/)
- [SpotBugs Official Documentation](https://spotbugs.github.io/)

### PHP Research
- [iCoderz Solutions - Laravel vs Symfony 2025](https://www.icoderzsolutions.com/blog/laravel-vs-symfony/)
- [Turing - Laravel vs Symfony Comparison](https://www.turing.com/kb/laravel-vs-symfony)
- [PHP-FIG PSR-4 Autoloader Standard](https://www.php-fig.org/psr/psr-4/)
