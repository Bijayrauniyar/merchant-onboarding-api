# Slice 1 Specification: Scaffolding, NestJS Core & Infrastructure

> **Status:** `COMPLETED`  
> **Target Commit:** `chore(infra): scaffold nestjs project with docker compose and typeorm`  
> **Relevant Architecture Sections:** [DESIGN.md Section 1 & 1.1](../DESIGN.md#1-system-overview--scope-boundary), [AGENTS.md Section 2 & 5](../AGENTS.md#2-system-architecture--boundaries)  

---

## 1. Objective & Scope

### In Scope
1. **Environment Configuration**:
   - Create `.env.example` with non-secret development defaults.
   - Create local `.env` (git-ignored) for local container and app execution.
2. **Project Scaffolding**:
   - `package.json` declaring NestJS 10+, TypeORM 0.3+, BullMQ 5+, `@nestjs/config`, `joi`, `class-validator`, `class-transformer`, `pg`, `ioredis`, and TypeScript 5+ dev tooling.
   - `tsconfig.json` with strict compiler checks (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`).
   - `nest-cli.json` standard NestJS CLI configuration.
3. **Docker Compose Topology**:
   - `docker-compose.yml` declaring `postgres:16-alpine` and `redis:7-alpine`.
   - Native container health checks (`pg_isready` for Postgres, `redis-cli ping` for Redis).
   - Named persistent storage volumes (`postgres_data`, `redis_data`).
4. **NestJS Core Foundation & Interactive Swagger UI**:
   - `src/config/configuration.ts`: Typed configuration factory.
   - `src/config/validation.schema.ts`: Joi validation schema to fail fast at boot if variables are missing or malformed.
   - `src/modules/health/health.controller.ts` & `health.module.ts`: Lightweight `GET /health` endpoint annotated with Swagger OpenAPI decorators.
   - `src/app.module.ts`: Root module importing ConfigModule and HealthModule.
   - `src/main.ts`: Application bootstrap with global `ValidationPipe`, CORS, graceful shutdown hooks, and OpenAPI Swagger documentation exposed at `/api/docs`.
   - `nest-cli.json`: Configured with `@nestjs/swagger` compiler plugin (`classValidatorShim: true`, `introspectComments: true`) for automated DTO schema generation without boilerplate.

### Out of Scope for Slice 1
- Database entities and migrations (Slice 2).
- JWT authentication and user endpoints (Slice 3).
- Merchant application CRUD and scoping (Slice 4).
- BullMQ worker processor execution (Slice 6).

---

## 2. File & Directory Manifest

```
merchant-onboarding-api/
├── .env.example                          # Environment variable template with placeholders
├── .env                                  # Local development environment (git-ignored)
├── package.json                          # Dependencies & scripts
├── tsconfig.json                         # Strict TypeScript configuration
├── tsconfig.build.json                   # Build-time TypeScript configuration
├── nest-cli.json                         # NestJS CLI schema
├── docker-compose.yml                    # PostgreSQL 16 & Redis 7 container orchestration
└── src/
    ├── main.ts                           # Global pipes, CORS, shutdown hooks, port listener
    ├── app.module.ts                     # Root module loading Config & Health
    ├── config/
    │   ├── configuration.ts              # Typed configuration object factory
    │   └── validation.schema.ts          # Joi schema for environment validation
    └── modules/
        └── health/
            ├── health.controller.ts      # GET /health endpoint
            └── health.module.ts          # HealthModule definition
```

---

## 3. Detailed Component Specifications

### 3.1 Dependencies (`package.json`)
- **Core Runtime:**
  - `@nestjs/common`: `^10.3.0`
  - `@nestjs/core`: `^10.3.0`
  - `@nestjs/platform-express`: `^10.3.0`
  - `@nestjs/config`: `^3.2.0`
  - `@nestjs/typeorm`: `^10.0.2`
  - `@nestjs/bullmq`: `^10.1.1`
  - `@nestjs/swagger`: `^7.3.0`
  - `@nestjs/passport`: `^10.0.3`
  - `@nestjs/jwt`: `^10.2.0`
  - `typeorm`: `^0.3.20`
  - `pg`: `^8.11.3`
  - `bullmq`: `^5.4.0`
  - `ioredis`: `^5.3.2`
  - `bcrypt`: `^5.1.1`
  - `passport`: `^0.7.0`
  - `passport-jwt`: `^4.0.1`
  - `class-validator`: `^0.14.1`
  - `class-transformer`: `^0.5.1`
  - `joi`: `^17.12.2`
  - `reflect-metadata`: `^0.2.1`
  - `rxjs`: `^7.8.1`
- **Development & Testing:**
  - `typescript`: `^5.3.3`
  - `@types/node`: `^20.11.0`
  - `@types/express`: `^4.17.21`
  - `@types/bcrypt`: `^5.0.2`
  - `@types/passport-jwt`: `^4.0.1`
  - `@types/jest`: `^29.5.12`
  - `@types/supertest`: `^6.0.2`
  - `jest`: `^29.7.0`
  - `ts-jest`: `^29.1.2`
  - `ts-node`: `^10.9.2`
  - `supertest`: `^6.3.4`

### 3.2 TypeScript Configuration (`tsconfig.json`)
- `target`: `ES2022`
- `module`: `commonjs`
- `moduleResolution`: `node`
- `strict`: `true`
- `noImplicitAny`: `true`
- `strictNullChecks`: `true`
- `experimentalDecorators`: `true`
- `emitDecoratorMetadata`: `true`
- `sourceMap`: `true`
- `outDir`: `./dist`

### 3.3 Container Orchestration (`docker-compose.yml`)
- **Service: `postgres`**
  - Image: `postgres:16-alpine`
  - Environment: `POSTGRES_USER=${DB_USERNAME}`, `POSTGRES_PASSWORD=${DB_PASSWORD}`, `POSTGRES_DB=${DB_DATABASE}`
  - Port mapping: `5432:5432`
  - Health check: `pg_isready -U ${DB_USERNAME} -d ${DB_DATABASE}`
  - Interval: `5s`, Timeout: `5s`, Retries: `5`
  - Volume: `postgres_data:/var/lib/postgresql/data`
- **Service: `redis`**
  - Image: `redis:7-alpine`
  - Command: `redis-server --appendonly yes`
  - Port mapping: `6379:6379`
  - Health check: `redis-cli ping`
  - Interval: `5s`, Timeout: `3s`, Retries: `5`
  - Volume: `redis_data:/data`

### 3.4 Typed Environment Configuration & Validation
- **Joi Validation Schema (`src/config/validation.schema.ts`):**
  - `NODE_ENV`: String, valid `['development', 'production', 'test']`, default `'development'`.
  - `PORT`: Number, default `3000`.
  - `DB_HOST`: String, required.
  - `DB_PORT`: Number, default `5432`.
  - `DB_USERNAME`: String, required.
  - `DB_PASSWORD`: String, required.
  - `DB_DATABASE`: String, required.
  - `REDIS_HOST`: String, required.
  - `REDIS_PORT`: Number, default `6379`.
  - `JWT_SECRET`: String, required (min length 16).
  - `JWT_EXPIRES_IN`: String, default `'24h'`.

### 3.5 Health Endpoint (`GET /health`)
- Route: `GET /health`
- Response Payload (`200 OK`):
  ```json
  {
    "status": "ok",
    "timestamp": "2026-11-18T15:15:00.000Z",
    "uptime": 12.34
  }
  ```

---

## 4. Verification & Acceptance Criteria

- [x] `npm install` installs all declared packages cleanly with zero peer dependency conflicts.
- [x] `docker-compose.yml` specifies PostgreSQL 16 and Redis 7 with healthchecks and persistent volumes.
- [x] Environment configuration validation with Joi schema in `src/config/validation.schema.ts`.
- [x] `npm run build` compiles TypeScript in strict mode without errors or warnings.
- [x] `GET /health` endpoint implemented and unit tested (`PASS src/modules/health/health.controller.spec.ts`).
- [x] Global `ValidationPipe` with whitelist and forbidNonWhitelisted configured in `src/main.ts`.
- [x] Graceful shutdown hooks enabled (`app.enableShutdownHooks()`).
- [x] `README.md` checklist marks Slice 1 as completed.

---

## 5. Transition to Implementation

Once this specification is reviewed and approved:
1. Update status to `IN_PROGRESS`.
2. Generate all Slice 1 files.
3. Run verification tests.
4. Update README checklist.
5. Provide Git commit command: `chore(infra): scaffold nestjs project with docker compose and typeorm`.
