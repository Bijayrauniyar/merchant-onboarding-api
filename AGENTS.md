# AGENTS.md — Engineering Standards & AI Governance

This document establishes the architectural guardrails, security invariants, and development standards for AI coding agents working on the **Merchant Onboarding & Risk Review API**.

---

## 1. Development Methodology: Spec-Driven Development (SDD)

1. **Single Source of Truth**:  
   All domain entities, lifecycle states, HTTP response codes, and sequence flows are specified in [DESIGN.md](./DESIGN.md). Agents must strictly implement the design specified therein without introducing unrequested tables, routes, or speculative features.
2. **Contract-First Implementation**:  
   Implement slice-by-slice. Before writing controllers or workers, verify that data models and state invariants match the specifications in `DESIGN.md`.
3. **No Phantom Requirements / No Over-Engineering**:  
   Do not add unrequested tables (e.g. no separate `Address`, `BankDetails`, `Reviewer`, or `Role` tables). Keep the 4-entity model lean and focused on the core requirements.

---

## 2. System Architecture & Boundaries

The codebase follows idiomatic NestJS modular architecture with clear separation of concerns:

```
src/
├── common/              # Shared guards, decorators, interceptors, filters, utilities
│   ├── decorators/      # @Roles(), @CurrentUser()
│   ├── guards/          # JwtAuthGuard, RolesGuard
│   ├── filters/         # Centralized HttpExceptionFilter
│   └── utils/           # Data masking & redaction utilities
├── config/              # Typed environment configuration & validation
├── database/            # TypeORM DataSource, migrations, and seed scripts
├── modules/
│   ├── auth/            # JWT issuance, bcrypt password hashing, login endpoint
│   ├── users/           # User entity and role definitions (ADMIN, REVIEWER, SALES)
│   ├── applications/    # Application CRUD, pure state machine, scoped queries
│   ├── risk/            # BullMQ producer, consumer worker, simulated KYB provider
│   └── audit/           # Append-only audit logger and sensitive data scrubber
└── main.ts              # Global validation pipes, Swagger setup, CORS, shutdown hooks
```

---

## 3. Mandatory Security & Object-Level Authorization Invariants

These rules prevent security vulnerabilities and address automatic-fail conditions:

1. **Two-Tier Authorization Enforcement**:
   - **Tier 1 (Route Level)**: `JwtAuthGuard` authenticates the token; `RolesGuard` checks the `@Roles(...)` metadata.
   - **Tier 2 (Database Query Scoping - CRITICAL)**: Never rely solely on route guards to protect individual resources. Every service query must explicitly enforce object ownership:
     - `SALES`: Queries must include `WHERE createdById = :userId`.
     - `REVIEWER`: Queries must include `WHERE assignedReviewerId = :userId`.
     - `ADMIN`: Unscoped queries for operational access.
2. **Anti-Enumeration Response Codes**:
   - When a `SALES` or `REVIEWER` user queries an application outside their scope, return **`404 Not Found`**, **never** `403 Forbidden`. A 403 leaks to attackers that the resource ID exists.
   - Use `403 Forbidden` only when a user's role is fundamentally barred from an endpoint (e.g. `SALES` calling reviewer decision routes, `ADMIN` calling reviewer decision routes).
3. **Decision Protection**:
   - Only the specific `assignedReviewerId` can record decisions on an application. `ADMIN` and other `REVIEWER` users cannot decide on another reviewer's assigned application.
4. **State Gating**:
   - A reviewer decision is strictly blocked with **`409 Conflict`** if `riskStatus == PENDING`. Human decisions require the automated background risk check to finish or exhaust retries.

---

## 4. Asynchronous Processing & Idempotency Rules (BullMQ)

1. **Three-Layer Idempotency**:
   - **Layer 1 (Queue Level)**: Deterministic job IDs: `risk:{applicationId}:{submissionVersion}`. Duplicate job submissions are ignored by Redis.
   - **Layer 2 (Database Level)**: Unique composite constraint on `RiskReview(applicationId, submissionVersion)`. Duplicate inserts fail at the database level.
   - **Layer 3 (Worker Pre-check)**: The worker re-checks application state before calling the simulated provider; it acknowledges and skips if the job is stale (`app.submissionVersion != job.submissionVersion`) or already processed.
2. **Post-Commit Enqueueing**:
   - Always enqueue BullMQ background jobs **after** the database transaction commits, ensuring the worker never attempts to read uncommitted data.
3. **Resilience & Failure Handling**:
   - Configure 3 retry attempts with exponential backoff.
   - When retries are exhausted, update `riskStatus = FAILED` and record a system audit entry. Never leave an application in `PENDING` indefinitely.

---

## 5. Code Standards & Quality Guidelines

1. **TypeScript Strictness**:
   - Strict mode enabled (`strict: true`, `noImplicitAny: true`).
   - Never use `any`. Use strict interfaces, DTO classes, or narrow union types.
   - Explicit return types on all controller handlers, public service methods, and worker processors.
2. **DTOs & Input Validation**:
   - Every input payload must be backed by a class using `class-validator` and `class-transformer`.
   - Global `ValidationPipe` must be configured with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
3. **TypeORM & Migrations**:
   - `synchronize: false` in production and test configurations.
   - All schema changes must be applied via reviewed TypeORM migration files.
4. **Sensitive Data & Audit Logging**:
   - **Zero Secrets Logging**: Passwords, hashes, raw tokens, and authorization headers must never be logged in application logs or audit logs.
   - **Redaction Helper**: All metadata written to `AuditLog` must pass through the central redaction utility that masks `ownerEmail` and `ownerPhone`.
   - **Deterministic KYB**: Simulated KYB responses must be deterministic (e.g. name containing `FAIL` throws retryable errors; `RISKY` returns `FLAGGED`; clean names return `PASSED`).

---

## 6. Testing & Verification Rules

Every code increment must be accompanied by automated tests:

1. **Unit Tests (`*.spec.ts`)**:
   - Pure state machine function (`canTransition`): Must exhaustively test all allowed and forbidden status transitions.
   - Data masking and redaction utilities.
2. **Integration / E2E Tests (`*.e2e-spec.ts`)**:
   - **Mandatory Authz Bypass Tests**: Explicitly verify that `sales-1` cannot read, update, or submit `sales-2`'s application (must return `404`).
   - **Decision Isolation**: Explicitly verify that `ADMIN` or an unassigned reviewer cannot record decisions (must return `403` or `404`).
   - **Idempotency Verification**: Trigger duplicate submissions or duplicate worker jobs and assert that only one `RiskReview` record is created.
   - **Retry Exhaustion**: Verify that simulated failure moves application `riskStatus` to `FAILED`.

---

## 7. Zero-Tolerance Constraints (Automatic-Fail Checks)

1. **No Committed Secrets**: Never commit `.env`, private keys, passwords, or production connection strings. Keep [.env.example](./.env.example) up to date with placeholder values.
2. **Synthetic Data Only**: All seed scripts and test payloads must use fictional merchant and personal data.
3. **Code Explanability**: Do not introduce obscure design patterns, complex metaprogramming, or unnecessary npm packages that cannot be easily justified and explained in a code review interview.
