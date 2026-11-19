# merchant-onboarding-api

NestJS API for merchant onboarding with asynchronous risk review (BullMQ), JWT authentication, role-based access control, and object-level authorization.

SALES staff create and submit merchant applications. Submitting triggers an asynchronous third-party risk/KYB check via a BullMQ background worker. An ADMIN assigns a REVIEWER, and only that assigned REVIEWER can approve, reject, or request more information. Every significant action is captured in an append-only audit trail.

---

## Core Workflow & Architectural Guarantees

1. **Merchant Application Lifecycle**: Applications progress through a strict finite state machine (`DRAFT` $\rightarrow$ `SUBMITTED` $\rightarrow$ `INFO_REQUESTED` $\rightarrow$ `APPROVED` / `REJECTED`). Applications are only editable in `DRAFT` and `INFO_REQUESTED`.
2. **Two-Tier Authorization & IDOR Protection**: Beyond route-level guards (`JwtAuthGuard`, `RolesGuard`), data isolation is enforced at the database query layer (`WHERE createdById = :userId` for Sales). Requests for unauthorized records return `404 Not Found` to prevent resource ID enumeration.
3. **Asynchronous Risk Review (Decoupled & Resilient)**: Submissions commit immediately and enqueue a BullMQ job in Redis. The worker processes the check with 3 exponential backoff retries and 3-layer idempotency (deterministic Redis `jobId`, relational unique constraint, and worker pre-checks).
4. **Segregation of Duties**: Only the assigned `REVIEWER` can record approval/rejection decisions. `ADMIN` and unassigned users are strictly prohibited from decision routes.
5. **Audit Logging & Sensitive Data Masking**: Significant lifecycle actions commit atomically with structured audit entries, scrubbing secrets and masking contact information (`ownerEmail`, `ownerPhone`).

---

## Tech Stack

- **Runtime & Framework**: NestJS 10+, Node.js (LTS), TypeScript (strict mode).
- **Database & ORM**: PostgreSQL 16, TypeORM 0.3+ with reviewed migrations (`synchronize: false`).
- **Queue & Message Broker**: Redis 7, BullMQ 5+.
- **Authentication**: Stateless JWT, bcrypt password hashing (10 salt rounds).
- **Testing**: Jest (unit tests), Supertest (integration & authorization tests).
- **API Documentation**: OpenAPI / Swagger (`/api/docs`).
- **Containerization**: Docker Compose (`postgres:16-alpine`, `redis:7-alpine`).

---

## Roles & Permissions Matrix

| Role | Application Access | Assigned Reviewer | Risk Decisions | Audit Log Access |
|---|---|---|---|---|
| **`ADMIN`** | Create, view, edit, and submit any application. | Assigns reviewers to `SUBMITTED` applications. | ❌ Forbidden (Enforces segregation of duties). | ✅ Full paginated access (`GET /audit-logs`). |
| **`REVIEWER`** | View only applications assigned to them. | Assigned by `ADMIN`. | ✅ Approve, reject, or request info on assigned applications. | ❌ Forbidden (`403 Forbidden`). |
| **`SALES`** | Create, view, edit, and submit **only their own** applications. | ❌ Cannot assign. | ❌ Forbidden (Cannot decide or approve). | ❌ Forbidden (`403 Forbidden`). |

---

## Documentation

- [DESIGN.md](./DESIGN.md): Detailed system specification, domain entities, state machine transitions, sequence diagrams, and architectural trade-offs.
- [AGENTS.md](./AGENTS.md): Engineering standards, security invariants, and AI governance guardrails.

---

## Development Status Checklist

- [x] System Architecture Specification (`DESIGN.md`)
- [x] AI Governance & Engineering Guardrails (`AGENTS.md`)
- [x] **Slice 1: Scaffolding & Infrastructure** (Docker Compose, NestJS core, ConfigModule, Swagger `/api/docs`, `/health`)
- [x] **Slice 2: Database Layer & Audit Module** (TypeORM migrations, `synchronize: false`, redaction utility, `AuditLog`, `HttpExceptionFilter`, `LoggingInterceptor`)
- [x] **Slice 3: Authentication & User Seeding** (JWT strategy, bcrypt, seed 5 users, `POST /auth/login`, route guards)
- [x] **Slice 4: Applications & Query Scoping** (`MerchantApplication` CRUD, Anti-IDOR scoping `createdById`, 404 tests)
- [x] **Slice 5: State Machine & Lifecycle** (Pure `canTransition()` validator, submit, assign, decision gating, 409 tests)
- [x] **Slice 6: Asynchronous Risk Review** (BullMQ + Redis, post-commit dispatch, 3-layer idempotency, 3x backoff retries, pessimistic write locks, queue failure recovery)
- [x] **Slice 7: Production Hardening, Security & Verification** (Login rate limiting on `POST /auth/login` via `@nestjs/throttler`, `helmet` security headers with Swagger CSP compatibility, 100kb payload DoS limit, PII diff redaction, administrative audit trail endpoint `GET /audit-logs`, and full 207-test suite pass)

---

## Getting Started

### Local Setup & Health Verification

```bash
# 1. Environment configuration
cp .env.example .env

# 2. Start PostgreSQL 16 and Redis 7 containers
docker compose up -d

# 3. Install dependencies
npm install

# 4. Run database migrations & seed deterministic test users
npm run migration:run
npm run seed

# 5. Build application (strict TypeScript compilation)
npm run build

# 6. Run automated test suites (unit + e2e)
npm test
npm run test:e2e

# 7. Start the development server
npm run start:dev

# 7. Check service health
curl http://localhost:3000/health
# Response: {"status":"ok","timestamp":"...","uptime":...}

# 8. Interactive Swagger documentation
# Open in browser: http://localhost:3000/api/docs
```

---

## How to Test & Verification Guide

### 1. Seeded Test Personas (`Password123!` for all)

| Persona | Email | Scope & Responsibilities |
|---|---|---|
| **`SALES`** | `sales1@example.com` | Create, edit, and submit own applications (Anti-IDOR query-scoped). |
| **`REVIEWER`** | `reviewer1@example.com` | Review assigned applications and record decisions (`APPROVE`, `REJECT`, `REQUEST_INFO`). |
| **`ADMIN`** | `admin@example.com` | Operational oversight, assigns reviewers, and views compliance audit trail (`GET /audit-logs`). |

### 2. End-to-End Workflow in Swagger UI (`http://localhost:3000/api/docs`)

All key endpoints include built-in **Examples dropdowns** so you can test complete lifecycles without writing JSON:

1. **Authenticate**:
   - Call `POST /auth/login` (select **SALES Persona** from dropdown) $\rightarrow$ copy `accessToken`.
   - Click the green **Authorize** button at the top right, paste token, click **Authorize**.
2. **Create Application (`POST /applications`)**:
   - Select an underwriting scenario from the **Examples dropdown**:
     - **`PASS Scenario`** (`Apex Coffee Roasters`) → Evaluates to score 85 and **`riskStatus: PASSED`**.
     - **`FLAG Scenario`** (`Risky High-Roller Gaming Lounge`) → Evaluates to score 45 and **`riskStatus: FLAGGED`**.
     - **`FAIL Scenario`** (`FailSafe Global Logistics`) → Simulates provider timeout, exhausts 3 retries, sets **`riskStatus: FAILED`**.
   - Click **Execute** and copy the returned `id`.
3. **Submit for Risk Review (`POST /applications/{id}/submit`)**:
   - Paste the application `id` and click **Execute**.
   - BullMQ processes underwriting asynchronously. Call `GET /applications/{id}` to verify the updated `riskStatus`.
4. **Assign Reviewer (`POST /applications/{id}/assign`)**:
   - Re-authorize as **`ADMIN`** (`admin@example.com`).
   - Call `GET /users?role=REVIEWER` to pick a reviewer ID (e.g. `reviewer1`).
   - Call `POST /applications/{id}/assign` with `{ "reviewerId": "<reviewer-uuid>" }`.
5. **Record Decision (`POST /applications/{id}/decision`)**:
   - Re-authorize as that **`REVIEWER`** (`reviewer1@example.com`).
   - Pick a determination from the **Examples dropdown**:
     - **`APPROVE`**: Moves application to terminal immutable `APPROVED` status.
     - **`REJECT`**: Mandatory rationale note $\rightarrow$ moves application to terminal immutable `REJECTED` status.
     - **`REQUEST_INFO`**: Mandatory clarification note $\rightarrow$ moves to `INFO_REQUESTED`, re-opening edit access for `SALES`.

### 3. Key Security & Guardrail Invariants to Verify

- **Anti-IDOR / Anti-Enumeration (`404 Not Found`)**: As `sales1`, call `GET /applications/{id}` on an application created by `sales2`. Returns **`404 Not Found`** (never leaks existence via 403).
- **Segregation of Duties (`403 Forbidden`)**: As `ADMIN`, attempt to call `POST /applications/{id}/decision`. Returns **`403 Forbidden`** (Admins are strictly barred from recording risk decisions).
- **Risk Gating (`409 Conflict`)**: Attempting a reviewer decision while `riskStatus == PENDING` returns **`409 Conflict`**.
- **Audit Trail & PII Redaction (`GET /audit-logs`)**: Log in as `ADMIN` to view the append-only audit trail with contact data masking (`ownerEmail`, `ownerPhone`).

### 4. Automated Test Suites

```bash
# Run 213 unit tests (state machine invariants, DTO validation, service logic)
npm test

# Run integration tests (authorization bypass, BullMQ retry exhaustion, idempotency)
npm run test:e2e
```

---

## Assumptions & Scope Boundaries

See Section 8 and Section 9 of [DESIGN.md](./DESIGN.md) for full architectural trade-offs and out-of-scope production considerations.

---

## AI Usage & Verification Disclosure

This project was developed using a **Spec-Driven, AI-augmented workflow** (leveraging Google Antigravity).

### Engineering Ownership & Verification Steps
1. **Architecture & Design:** All system design, the 4-entity data model, the finite state machine, and the object-level authorization query-scoping model were architected independently and documented in [DESIGN.md](./DESIGN.md) prior to implementation.
2. **Governance & Standards:** Architectural guardrails, security constraints, and code quality invariants were codified in [AGENTS.md](./AGENTS.md) to steer the AI assistant and prevent hallucinations or scope creep.
3. **Code Review:** Every generated module, guard, service, and worker was reviewed line-by-line to enforce NestJS best practices, strict typing, and clean error handling.
4. **Automated Verification:** All unit tests (state machine invariants) and integration tests (object-level authorization bypass attempts, BullMQ worker retries/idempotency) were executed and verified against local PostgreSQL and Redis containers.
5. **Security & Secrets Audit:** The repository and git commit history were verified using automated scans to ensure zero committed credentials, secrets, or real customer data.