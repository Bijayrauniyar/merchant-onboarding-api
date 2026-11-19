# Slice 6 Specification: Reviewer Directory & Asynchronous Risk Review (BullMQ + Redis)

> **Status:** `IN_PROGRESS`  
> **Target Commit:** `feat(risk): implement reviewer user directory and bullmq async risk worker with 3-layer idempotency`  
> **Relevant Architecture Sections:** [DESIGN.md Section 3 (User Directory)](../DESIGN.md#3-roles-and-permissions), [DESIGN.md Section 5 (Asynchronous Risk Flow)](../DESIGN.md#5-asynchronous-risk-flow-redis--bullmq-architecture), [AGENTS.md Section 4 (Idempotency Rules)](../AGENTS.md#4-asynchronous-processing--idempotency-rules-bullmq)  

---

## 1. Objective & Scope

Slice 6 delivers the asynchronous verification backbone and consumer frontend support for the Merchant Onboarding API:
1. **User Directory Endpoint (`GET /users?role=REVIEWER`)**:
   - Enables Admin users and frontend client interfaces to query qualified reviewers for assignment dropdowns.
   - Strictly restricted to `ADMIN` users; excludes sensitive fields (`passwordHash`) from response DTO.
2. **Asynchronous Risk Processing Architecture (BullMQ + Redis)**:
   - Post-commit queue dispatch upon application submission with deterministic job IDs (`risk:{applicationId}:{submissionVersion}`).
   - Relational persistence of risk review results in `RiskReview` entity with composite unique constraint `(applicationId, submissionVersion)`.
   - BullMQ worker processor with 3-layer idempotency, 3 exponential backoff retries (2s, 4s, 8s), and simulated deterministic KYB responses.
   - Graceful retry exhaustion moving `riskStatus` to `FAILED` and unblocking audit logging.

---

## 2. Granular Task Breakdown

### Task 6.1: User Directory Endpoint for Reviewer Selection (`GET /users?role=REVIEWER`)
- **What:** Provide an Admin-only endpoint to list users filtered by role, enabling frontend dropdown population for reviewer assignment without credential leakage.
- **Files:**
  - `src/modules/users/dto/query-users.dto.ts`:
    - `role?: UserRole` (optional enum filter).
  - `src/modules/users/dto/user-response.dto.ts`:
    - `id: string`, `email: string`, `role: UserRole`, `createdAt: Date`.
    - Strictly excludes `passwordHash`.
  - `src/modules/users/docs/users.swagger.ts`:
    - `@ApiUsersDocs()`, `@ApiFindAllUsersDoc()`: 200 OK, 401 Unauthorized, 403 Forbidden.
  - `src/modules/users/users.service.ts`:
    - `findAll(role?: UserRole): Promise<UserResponseDto[]>`.
  - `src/modules/users/users.controller.ts`:
    - `@Get()` handler with `@Roles(UserRole.ADMIN)` and `@UseGuards(JwtAuthGuard, RolesGuard)`.
  - `src/modules/users/users.service.spec.ts`:
    - Unit tests verifying role filtering, empty role behavior, and zero `passwordHash` leakage.
- **Verification:** Run `npm run build` and `npm test -- users.service.spec.ts`.

---

### Task 6.2: BullMQ Module Setup & `RiskReview` Relational Model
- **What:** Configure BullMQ queue in NestJS connected to Redis, and create the `RiskReview` TypeORM entity with reviewed migration.
- **Files:**
  - `src/database/migrations/*-CreateRiskReviewsTable.ts`:
    - Table: `risk_reviews`.
    - Columns: `id (uuid, PK)`, `application_id (uuid, FK merchant_applications)`, `submission_version (int)`, `result (varchar 50)`, `score (numeric 5,2)`, `raw_response (jsonb)`, `created_at (timestamptz)`.
    - Unique composite constraint: `(application_id, submission_version)`.
  - `src/modules/risk/entities/risk-review.entity.ts`:
    - TypeORM entity with `@Index(['applicationId', 'submissionVersion'], { unique: true })`.
  - `src/modules/risk/enums/risk-result.enum.ts`:
    - Values: `PASSED`, `FLAGGED`.
  - `src/modules/risk/risk.module.ts`:
    - Register BullMQ `BullModule.registerQueue({ name: 'risk-evaluation' })`.
- **Verification:** Run `npm run migration:run` and verify schema in PostgreSQL.

---

### Task 6.3: Post-Commit Queue Producer Dispatch
- **What:** Queue producer service dispatching deterministic risk evaluation jobs strictly after database commit.
- **Files:**
  - `src/modules/risk/risk.producer.ts`:
    - Method `enqueueRiskReview(applicationId: string, submissionVersion: number): Promise<void>`.
    - Deterministic Job ID: `risk:${applicationId}:${submissionVersion}`.
    - Options: `attempts: 3`, `backoff: { type: 'exponential', delay: 2000 }`, `removeOnComplete: true`, `removeOnFail: false`.
  - `src/modules/applications/applications.service.ts`:
    - Inject `RiskProducer`.
    - In `submit(id, user)`: Dispatch `this.riskProducer.enqueueRiskReview(...)` strictly **after** `this.dataSource.transaction` successfully commits.
- **Verification:** Unit tests verifying producer options and post-commit dispatch order.

---

### Task 6.4: Worker Processor, 3-Layer Idempotency & Simulated KYB Provider
- **What:** Background BullMQ worker processor executing simulated KYB checks, enforcing 3-layer idempotency, updating application state, and logging audit entries.
- **Files:**
  - `src/modules/risk/providers/simulated-kyb.provider.ts`:
    - Deterministic simulation:
      - Name contains `FAIL` -> Throws retryable downstream error (`Error('KYB Provider Timeout')`).
      - Name contains `RISKY` -> Returns `{ result: 'FLAGGED', score: 45.0, rawResponse: {...} }`.
      - Other names -> Returns `{ result: 'PASSED', score: 85.0, rawResponse: {...} }`.
  - `src/modules/risk/risk.processor.ts`:
    - `@Processor('risk-evaluation')` with `@Process()` handler.
    - **Idempotency Layer 1 (Queue Level)**: Deterministic `jobId` in Redis prevents duplicate queueing.
    - **Idempotency Layer 2 (Relational Level)**: Composite unique constraint `(applicationId, submissionVersion)` prevents duplicate rows.
    - **Idempotency Layer 3 (Worker Level)**:
      - Pre-check 1: Verify application exists, `status === SUBMITTED`, and `submissionVersion === job.data.submissionVersion` (skip stale jobs).
      - Pre-check 2: Verify `RiskReview` does not already exist for `(applicationId, submissionVersion)`.
    - Transaction execution: Saves `RiskReview`, updates `MerchantApplication.riskStatus`, and emits `RISK_REVIEW_COMPLETED` audit log.
    - `@OnQueueFailed()` event handler: On 3rd retry exhaustion, updates `riskStatus = FAILED` and emits `RISK_REVIEW_FAILED` audit log.
- **Verification:** Unit tests for processor idempotency layers and retry failure hooks.

---

### Task 6.5: End-to-End Integration Suite & Documentation Sync
- **What:** Supertest E2E integration tests verifying the live background processing pipeline against PostgreSQL and Redis.
- **Files:**
  - `test/risk.e2e-spec.ts`:
    - Admin queries `GET /users?role=REVIEWER` -> Verifies 200 OK and no `passwordHash`.
    - Sales submits standard application -> Worker processes job -> `riskStatus` becomes `PASSED` -> Reviewer decision unblocked.
    - Sales submits risky application -> Worker sets `riskStatus` to `FLAGGED` -> Reviewer evaluates advisory score.
    - Sales submits `FAIL` application -> Worker fails 3 times with exponential backoff -> `riskStatus` transitions to `FAILED`.
    - Duplicate job submission asserts single `RiskReview` record created (Idempotency).
  - `README.md`: Update Slice 6 checklist.
- **Verification:** Run `npm run build`, `npm test`, and `npm run test:e2e`.

---

## 3. Acceptance Criteria & Definition of Done

- [ ] `GET /users?role=REVIEWER` restricted to Admin; returns qualified reviewers without `passwordHash`.
- [ ] Submitting an application enqueues a background job with deterministic ID `risk:{appId}:{version}`.
- [ ] Jobs are enqueued post-commit (never before database transaction finishes).
- [ ] 3-layer idempotency prevents duplicate reviews across queue, relational database, and worker.
- [ ] Simulated KYB provider handles `FAIL` (3 retries with backoff $\rightarrow$ `FAILED`), `RISKY` (`FLAGGED`), and clean (`PASSED`).
- [ ] When retries exhaust, `riskStatus` moves to `FAILED` and records an audit log (never stuck in `PENDING`).
- [ ] All unit and E2E tests pass. Code compiles with 0 TypeScript errors.
- [ ] All files left unstaged in working tree for user review.
