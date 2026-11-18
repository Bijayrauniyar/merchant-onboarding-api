# Design: Merchant Onboarding and Risk Review API

## 1. Goal & Architecture Overview

An internal API for a payments company to onboard merchants. SALES staff create and submit merchant applications. Submitting triggers an asynchronous (simulated) third-party risk/KYB check. An ADMIN assigns the application to a REVIEWER, and only that REVIEWER can approve, reject or request more information. Every significant action is audited.

The scope covers the core domain requirements: merchant onboarding lifecycle, object-level authorization, asynchronous risk review, and audit logging. Optional production enhancements (webhook callback, secondary MongoDB audit store, separate ADR document) are deferred to prioritize domain integrity, security guarantees, and comprehensive test coverage (see section 9).

### 1.1 Technology Stack

The platform architecture consists of the following core technologies:
- **NestJS 10+ & TypeScript**: Modular dependency injection, global validation pipes, centralized exception filters, and strict typing.
- **PostgreSQL 16 & TypeORM**: Primary relational database for all domain entities and audit logs, managed strictly with reviewed migrations (`synchronize: false`).
- **Redis 7 & BullMQ 5+**: In-memory message broker and distributed queue for non-blocking asynchronous risk review processing.
- **JWT & bcrypt**: Stateless authentication tokens and secure password hashing (10 salt rounds).
- **Docker Compose**: Containerized local environment orchestrating PostgreSQL and Redis.
- **Jest & Supertest**: Unit testing suite for pure domain logic and integration suite for API/authorization flows.
- **OpenAPI / Swagger**: Interactive API documentation at `/api/docs`.

## 2. Entities

**User**
`id (uuid)`, `email (unique)`, `passwordHash`, `role (ADMIN | REVIEWER | SALES)`, `createdAt`

**MerchantApplication**
`id (uuid)`, `businessName`, `legalBusinessName`, `businessType (enum)`, `ownerName`, `ownerEmail`, `ownerPhone`, `requestedMonthlyVolume`, `requestedAvgTicket`, `status`, `riskStatus`, `submissionVersion (int, default 0)`, `createdById (FK User)`, `assignedReviewerId (FK User, nullable)`, `decisionNote (nullable)`, `decidedAt (nullable)`, `createdAt`, `updatedAt`

**RiskReview**
`id (uuid)`, `applicationId (FK)`, `submissionVersion`, `result (PASSED | FLAGGED)`, `score`, `rawResponse (jsonb)`, `createdAt`
Unique constraint: `(applicationId, submissionVersion)`

**AuditLog**
`id (uuid)`, `actorId (nullable, null = system/worker)`, `action`, `entityType`, `entityId`, `metadata (jsonb, redacted)`, `createdAt`

Indexes: `MerchantApplication(createdById)`, `(assignedReviewerId)`, `(status)`; `AuditLog(entityType, entityId)`.

### 2.1 Storage Architecture
- **Unified Relational Store**: PostgreSQL maintains transactional domain entities (`MerchantApplication`, `User`, `RiskReview`) and append-only compliance history (`AuditLog`).
- **Schema Evolution (`synchronize: false`)**: Runtime auto-synchronization is disabled to prevent accidental column drops or locks during restarts. Schema changes are applied via versioned, reviewed TypeORM SQL migrations (`src/database/migrations/*`).
- **Transaction Atomicity**: State transitions (e.g. updating status to `APPROVED`) and compliance audit entries (`AuditLog`) execute inside atomic database transactions (`dataSource.transaction`), guaranteeing zero un-audited state changes.

## 3. Roles and permissions

| Action | ADMIN | REVIEWER | SALES |
|---|---|---|---|
| Login | yes | yes | yes |
| Create application | yes | no | yes |
| View / list applications | all | only where assigned to them | only ones they created |
| Update application (when editable) | any | no | only ones they created |
| Submit application | any | no | only ones they created |
| Assign reviewer | yes | no | no |
| Record decision | no | only if assigned | no |

### 3.1 Invariants & Security Rules
- **Decision Segregation**: Only the specifically assigned `REVIEWER` may record risk decisions (`APPROVE`, `REJECT`, `REQUEST_INFO`). `ADMIN` and other unassigned users are barred from decision endpoints.
- **Assignment Constraints**: Reviewers must hold the `REVIEWER` role. An application cannot be assigned to `SALES` or `ADMIN`.
- **Internal Provisioning**: User accounts are provisioned via database seed scripts; public user registration is intentionally omitted for this internal operational platform.

### 3.2 Authentication & Token Architecture (JWT & bcrypt)
- **Password Security**: Passwords are saved as bcrypt hashes (10 salt rounds). Credentials are authenticated via `POST /auth/login`.
- **Stateless Authorization**: Protected routes use stateless Bearer JWTs signed with `sub` (user ID) and `role`. Guards (`JwtAuthGuard`, `RolesGuard`) validate tokens in memory without querying the database on each request.
- **Context Injection**: The verified token populates `req.user`, providing the authenticated caller identity for query scoping.

### 3.3 Authentication Flow (`POST /auth/login`)
```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant AuthCtrl as AuthController
    participant AuthSvc as AuthService
    participant DB as PostgreSQL (TypeORM)

    Client->>AuthCtrl: POST /auth/login { email, password }
    AuthCtrl->>AuthSvc: login(email, password)
    AuthSvc->>DB: findOne(User, { email })
    
    alt User not found or invalid password
        DB-->>AuthSvc: null or mismatched bcrypt hash
        AuthSvc-->>AuthCtrl: throw UnauthorizedException
        AuthCtrl-->>Client: 401 Unauthorized
    else Valid credentials
        DB-->>AuthSvc: User { id, email, role, passwordHash }
        AuthSvc->>AuthSvc: bcrypt.compare() == true
        AuthSvc->>AuthSvc: jwtService.sign({ sub: id, email, role })
        AuthSvc-->>AuthCtrl: { accessToken }
        AuthCtrl-->>Client: 200 OK { accessToken }
    end
```

## 4. Status model and Lifecycle State Machine

The system separates **Business Workflow (`status`)** from **Automated Background Verification (`riskStatus`)**. Keeping them orthogonal ensures async checks never corrupt human decision states, and vice versa.

### 4.1 Status Definitions

#### A. Application Business Status (`status`)
1. **`DRAFT`**: Initial state upon creation by `SALES` (or `ADMIN`). Fully editable.
2. **`SUBMITTED`**: Application is locked for editing and undergoing review. Open for reviewer assignment and async risk check.
3. **`INFO_REQUESTED`**: The assigned reviewer requires clarifications or corrections. Editing re-opens for `SALES`.
4. **`APPROVED`**: Final approved state. Terminal and immutable.
5. **`REJECTED`**: Final declined state. Terminal and immutable.

#### B. Asynchronous Risk Status (`riskStatus`)
1. **`NOT_STARTED`**: Initial state while application is in `DRAFT`.
2. **`PENDING`**: Triggered automatically on submission while the BullMQ worker is processing the simulated KYB check.
3. **`PASSED`**: Third-party check completed cleanly with an acceptable risk score.
4. **`FLAGGED`**: Third-party check flagged potential anomalies (advisory; human reviewer makes final call).
5. **`FAILED`**: Worker exhausted all retry attempts due to downstream outages or simulated failure.

---

### 4.2 State Transition Diagram

```
       [ SALES creates ]
               │
               ▼
          ┌─────────┐
          │  DRAFT  │◄─────────────────────────────────────────────┐
          └────┬────┘                                              │
               │ POST /applications/:id/submit                     │
               ▼                                                   │
        ┌─────────────┐                                            │
   ┌───►│  SUBMITTED  │ (ADMIN assigns REVIEWER)                   │
   │    └──────┬──────┘ (BullMQ runs async KYB in background)      │
   │           │                                                   │
   │           ├───────────────┬───────────────────┐               │
   │           ▼               ▼                   ▼               │
   │     [ approve ]      [ reject ]      [ request_info ]         │
   │           │               │                   │               │
   │           ▼               ▼                   ▼               │
   │     ┌───────────┐   ┌───────────┐   ┌──────────────────┐      │
   │     │ APPROVED  │   │ REJECTED  │   │  INFO_REQUESTED  │      │
   │     │ (Terminal)│   │ (Terminal)│   └─────────┬────────┘      │
   │     └───────────┘   └───────────┘             │               │
   │                                               │ SALES edits   │
   │                                               │ & resubmits   │
   └───────────────────────────────────────────────┴───────────────┘
```

---

### 4.3 Lifecycle Rules & Invariants

1. **Editability**:
   - Applications can **only** be modified (`PATCH /applications/:id`) when in `DRAFT` or `INFO_REQUESTED`.
   - Once `SUBMITTED`, `APPROVED`, or `REJECTED`, all application fields are strictly locked against updates.

2. **Submission (`POST /applications/:id/submit`)**:
   - Allowed transitions: `DRAFT -> SUBMITTED` or `INFO_REQUESTED -> SUBMITTED`.
   - Atomically updates `status = SUBMITTED`, `riskStatus = PENDING`, increments `submissionVersion += 1`, writes audit log, and enqueues the async risk job (detailed in Section 5).

3. **Reviewer Assignment (`POST /applications/:id/assign`)**:
   - Permitted **only** when `status = SUBMITTED`.
   - Can **only** be performed by `ADMIN`. Target user must hold the `REVIEWER` role.
   - Assignment persists across resubmissions (i.e. if moved to `INFO_REQUESTED` and resubmitted, the assigned reviewer remains in place).

4. **Reviewer Decision (`POST /applications/:id/decision`)**:
   - Permitted **only** when:
     - Caller is the specific `assignedReviewerId` (ADMINs and other reviewers are rejected).
     - `status == SUBMITTED`.
     - `riskStatus != PENDING` (human decision is blocked until the async background check completes or reaches max retries).
   - Valid decisions:
     - `APPROVE`: Transitions to `APPROVED`. Note is optional.
     - `REJECT`: Transitions to `REJECTED`. Note is **mandatory**.
     - `REQUEST_INFO`: Transitions to `INFO_REQUESTED`. Note is **mandatory** (gives SALES actionable guidance).

5. **Terminal States**:
   - `APPROVED` and `REJECTED` are final. Any subsequent edit, submit, assign, or decision attempt returns `409 Conflict`.

6. **Single Source of Truth**:
   - All transition rules are encoded in a pure function (`canTransition(currentStatus, targetAction)`) covered by exhaustive unit tests. Controllers and services consume this single validator.

### 4.4 Lifecycle Sequence Diagrams

#### A. Create Application (`POST /applications`)
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (SALES / ADMIN)
    participant Guards as JwtAuthGuard & RolesGuard
    participant AppCtrl as ApplicationsController
    participant AppSvc as ApplicationsService
    participant Audit as AuditService
    participant DB as PostgreSQL (TypeORM)

    Client->>Guards: POST /applications (Bearer JWT, DTO)
    
    alt Role is REVIEWER
        Guards-->>Client: 403 Forbidden
    else Role is SALES or ADMIN
        Guards->>AppCtrl: forward request (user payload)
        AppCtrl->>AppSvc: create(createAppDto, user)
        AppSvc->>DB: Begin Transaction
        AppSvc->>DB: INSERT INTO merchant_applications (status: DRAFT, riskStatus: NOT_STARTED, createdById: user.id, ...)
        AppSvc->>Audit: record(APPLICATION_CREATED, appId, user.id, metadata)
        Audit->>DB: INSERT INTO audit_logs (redacted metadata)
        AppSvc->>DB: Commit Transaction
        AppSvc-->>AppCtrl: MerchantApplication
        AppCtrl-->>Client: 201 Created { id, status: "DRAFT", ... }
    end
```

#### B. Update Application (`PATCH /applications/:id`)
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (SALES / ADMIN)
    participant Guards as JwtAuthGuard & RolesGuard
    participant AppCtrl as ApplicationsController
    participant AppSvc as ApplicationsService
    participant StateMachine as State Machine Validator
    participant Audit as AuditService
    participant DB as PostgreSQL (TypeORM)

    Client->>Guards: PATCH /applications/:id (Bearer JWT, updateDto)
    Guards->>AppCtrl: forward request
    AppCtrl->>AppSvc: update(id, updateDto, user)
    AppSvc->>DB: findOne with scoped query (by id & createdById if SALES)
    
    alt Record not found
        DB-->>AppSvc: null
        AppSvc-->>Client: 404 Not Found
    else Record exists
        DB-->>AppSvc: MerchantApplication
        AppSvc->>StateMachine: isEditable(application.status)
        alt status NOT IN ('DRAFT', 'INFO_REQUESTED')
            StateMachine-->>AppSvc: false
            AppSvc-->>Client: 409 Conflict ("Application is locked for updates")
        else status is DRAFT or INFO_REQUESTED
            StateMachine-->>AppSvc: true
            AppSvc->>DB: Begin Transaction
            AppSvc->>DB: UPDATE merchant_applications SET ... WHERE id = :id
            AppSvc->>Audit: record(APPLICATION_UPDATED, appId, user.id, diff)
            Audit->>DB: INSERT INTO audit_logs (redacted changes)
            AppSvc->>DB: Commit Transaction
            AppSvc-->>AppCtrl: Updated MerchantApplication
            AppCtrl-->>Client: 200 OK { updated data }
        end
    end
```

#### C. Assign Reviewer (`POST /applications/:id/assign`)
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (ADMIN)
    participant Guards as JwtAuthGuard & RolesGuard
    participant AppCtrl as ApplicationsController
    participant AppSvc as ApplicationsService
    participant Audit as AuditService
    participant DB as PostgreSQL (TypeORM)

    Client->>Guards: POST /applications/:id/assign { reviewerId } (Bearer JWT)
    
    alt Caller is NOT ADMIN
        Guards-->>Client: 403 Forbidden
    else Caller is ADMIN
        Guards->>AppCtrl: forward request
        AppCtrl->>AppSvc: assignReviewer(id, reviewerId, adminUser)
        AppSvc->>DB: findOne(MerchantApplication, id)
        
        alt Application not found
            AppSvc-->>Client: 404 Not Found
        else status != 'SUBMITTED'
            AppSvc-->>Client: 409 Conflict ("Application must be in SUBMITTED state to assign")
        else Target user is not REVIEWER
            AppSvc->>DB: findOne(User, reviewerId)
            AppSvc-->>Client: 400 Bad Request ("Assigned user must hold REVIEWER role")
        else Valid assignment
            AppSvc->>DB: Begin Transaction
            AppSvc->>DB: UPDATE merchant_applications SET assignedReviewerId = :reviewerId WHERE id = :id
            AppSvc->>Audit: record(REVIEWER_ASSIGNED, id, adminUser.id, { reviewerId })
            Audit->>DB: INSERT INTO audit_logs
            AppSvc->>DB: Commit Transaction
            AppSvc-->>AppCtrl: Updated Application
            AppCtrl-->>Client: 200 OK { assignedReviewerId: reviewerId, ... }
        end
    end
```

#### D. Record Reviewer Decision (`POST /applications/:id/decision`)
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (REVIEWER)
    participant Guards as JwtAuthGuard & RolesGuard
    participant AppCtrl as ApplicationsController
    participant AppSvc as ApplicationsService
    participant Audit as AuditService
    participant DB as PostgreSQL (TypeORM)

    Client->>Guards: POST /applications/:id/decision { decision, note } (Bearer JWT)
    
    alt Caller role is NOT REVIEWER (e.g. ADMIN or SALES)
        Guards-->>Client: 403 Forbidden
    else Caller is REVIEWER
        Guards->>AppCtrl: forward request (reviewer user)
        AppCtrl->>AppSvc: recordDecision(id, decisionDto, reviewer)
        AppSvc->>DB: SELECT * FROM merchant_applications WHERE id = :id AND assignedReviewerId = :reviewer.id
        
        alt Record not found (not assigned to this reviewer)
            DB-->>AppSvc: null
            AppSvc-->>Client: 404 Not Found
        else Record found
            note over AppSvc: Enforce decision invariants
            alt status != 'SUBMITTED'
                AppSvc-->>Client: 409 Conflict ("Can only decide on SUBMITTED applications")
            else riskStatus == 'PENDING'
                AppSvc-->>Client: 409 Conflict ("Risk check still in progress. Decision gated until completed.")
            else decision IN ('REJECT', 'REQUEST_INFO') AND note is empty
                AppSvc-->>Client: 400 Bad Request ("Note is required for reject or request_info")
            else Invariants satisfied
                AppSvc->>DB: Begin Transaction
                alt decision == 'APPROVE'
                    AppSvc->>DB: UPDATE merchant_applications SET status = 'APPROVED', decidedAt = NOW(), decisionNote = :note
                else decision == 'REJECT'
                    AppSvc->>DB: UPDATE merchant_applications SET status = 'REJECTED', decidedAt = NOW(), decisionNote = :note
                else decision == 'REQUEST_INFO'
                    AppSvc->>DB: UPDATE merchant_applications SET status = 'INFO_REQUESTED', decisionNote = :note
                end
                AppSvc->>Audit: record(DECISION_RECORDED, id, reviewer.id, { decision, note })
                Audit->>DB: INSERT INTO audit_logs
                AppSvc->>DB: Commit Transaction
                AppSvc-->>AppCtrl: Updated Application
                AppCtrl-->>Client: 200 OK { status: targetStatus, decisionNote: note, ... }
            end
        end
    end
```

## 5. Asynchronous Risk Flow (Redis & BullMQ Architecture)

### 5.1 Queue Architecture & Asynchronous Mechanics
- **Decoupled Execution**: Verification against external risk/KYB providers is decoupled from the synchronous HTTP request cycle. `POST /applications/:id/submit` updates the database status to `SUBMITTED`, enqueues a background job to Redis, and returns `200 OK` immediately.
- **Queue Configuration**:
  - Queue Name: `risk-evaluation`
  - Connection: Redis (port `6379`) configured via `BullModule`
  - Producer Job Options:
    - `jobId: risk:{applicationId}:{submissionVersion}` (Deterministic deduplication key in Redis)
    - `attempts: 3` (Maximum retry attempts)
    - `backoff: { type: 'exponential', delay: 2000 }` (Exponential retries at 2s, 4s, 8s)
    - `removeOnComplete: true`, `removeOnFail: false` (Retains failed jobs for inspection)
- **Post-Commit Enqueueing**: Jobs are dispatched to Redis strictly after the PostgreSQL transaction commits, preventing race conditions where workers query uncommitted application state.
- **Three-Layer Idempotency**:
  - **Queue Layer (Redis)**: Deterministic `jobId`. Duplicate job submissions with identical application ID and version are dropped by Redis.
  - **Database Layer (TypeORM)**: Unique composite constraint on `RiskReview(applicationId, submissionVersion)` prevents duplicate rows.
  - **Worker Layer**: Pre-check skips processing if `app.submissionVersion != job.submissionVersion` (stale job) or if a `RiskReview` record already exists.

### 5.2 End-to-End Processing Steps
1. `POST /applications/:id/submit` executes inside a database transaction (`status = SUBMITTED`, `riskStatus = PENDING`, `submissionVersion += 1`, and audit log). After commit, the BullMQ job is enqueued to Redis.
2. The worker (`RiskReviewWorker`) picks up the job and performs idempotency skip checks.
3. The worker invokes the simulated KYB provider (deterministic: name containing `FAIL` throws, containing `RISKY` returns `FLAGGED`, clean names return `PASSED`).
4. In one database transaction: inserts `RiskReview`, updates `MerchantApplication.riskStatus`, and writes an audit log (`actorId = null` for system).
5. Retries: If the provider throws, Redis manages exponential retries. Upon 3rd exhaustion, the worker sets `riskStatus = FAILED` and writes a failure audit record.

### 5.3 Application Submission Flow (`POST /applications/:id/submit`)
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (SALES / ADMIN)
    participant Guards as JwtAuthGuard & RolesGuard
    participant AppCtrl as ApplicationsController
    participant AppSvc as ApplicationsService
    participant Audit as AuditService
    participant DB as PostgreSQL (TypeORM)
    participant Queue as BullMQ (Redis)

    Client->>Guards: POST /applications/:id/submit (Bearer JWT)
    Guards->>AppCtrl: forward request
    AppCtrl->>AppSvc: submit(id, user)
    AppSvc->>DB: findOne with scoped query
    
    alt Status NOT IN ('DRAFT', 'INFO_REQUESTED')
        AppSvc-->>Client: 409 Conflict ("Cannot submit in current state")
    else Valid submission state
        AppSvc->>DB: Begin Transaction
        AppSvc->>DB: UPDATE merchant_applications SET status = 'SUBMITTED', riskStatus = 'PENDING', submissionVersion = submissionVersion + 1 WHERE id = :id
        AppSvc->>Audit: record(APPLICATION_SUBMITTED, appId, user.id)
        Audit->>DB: INSERT INTO audit_logs
        AppSvc->>DB: Commit Transaction
        
        note over AppSvc,Queue: Job dispatched AFTER database commit
        AppSvc->>Queue: add("risk-review", { applicationId, submissionVersion }, jobId: "risk:{id}:{version}")
        AppSvc-->>AppCtrl: Submitted Application
        AppCtrl-->>Client: 200 OK { status: "SUBMITTED", riskStatus: "PENDING", ... }
    end
```

### 5.4 Background Risk Review Worker Flow (BullMQ & Redis)
```mermaid
sequenceDiagram
    autonumber
    participant Queue as BullMQ (Redis)
    participant Worker as RiskReviewWorker
    participant KYB as Simulated KYB Provider
    participant Audit as AuditService
    participant DB as PostgreSQL (TypeORM)

    Queue->>Worker: processJob(job { applicationId, submissionVersion })
    Worker->>DB: SELECT * FROM merchant_applications WHERE id = :applicationId
    
    note over Worker,DB: Idempotency Layer 1: Check stale submission
    alt app.status != 'SUBMITTED' OR app.submissionVersion != job.submissionVersion
        Worker-->>Queue: acknowledge & skip (stale job)
    else Valid pending check
        Worker->>DB: SELECT * FROM risk_reviews WHERE applicationId = :id AND submissionVersion = :version
        note over Worker,DB: Idempotency Layer 2: Check duplicate execution
        alt Review record already exists
            Worker-->>Queue: acknowledge & skip (already processed)
        else Run KYB Check
            Worker->>KYB: evaluateBusiness(businessName)
            
            alt Business name contains 'FAIL' (Transitory Downstream Error)
                KYB-->>Worker: throw Network/Provider Error
                Worker-->>Queue: Job fails -> BullMQ triggers retry with exponential backoff
                note over Worker,Queue: On final (3rd) retry exhaustion:
                Worker->>DB: UPDATE merchant_applications SET riskStatus = 'FAILED'
                Worker->>Audit: record(RISK_REVIEW_FAILED, appId, null)
            else Business name contains 'RISKY'
                KYB-->>Worker: { result: "FLAGGED", score: 45, rawResponse: {...} }
                Worker->>DB: Begin Transaction
                Worker->>DB: INSERT INTO risk_reviews (applicationId, submissionVersion, result: "FLAGGED", score: 45)
                Worker->>DB: UPDATE merchant_applications SET riskStatus = "FLAGGED"
                Worker->>Audit: record(RISK_REVIEW_COMPLETED, appId, null)
                Worker->>DB: Commit Transaction
                Worker-->>Queue: acknowledge job success
            else Standard Business Name
                KYB-->>Worker: { result: "PASSED", score: 85, rawResponse: {...} }
                Worker->>DB: Begin Transaction
                Worker->>DB: INSERT INTO risk_reviews (applicationId, submissionVersion, result: "PASSED", score: 85)
                Worker->>DB: UPDATE merchant_applications SET riskStatus = "PASSED"
                Worker->>Audit: record(RISK_REVIEW_COMPLETED, appId, null)
                Worker->>DB: Commit Transaction
                Worker-->>Queue: acknowledge job success
            end
        end
    end
```

## 6. Authorization & Object-Level Scoping

### 6.1 Two-Tier Authorization Architecture
1. **Tier 1 (Route Level)**: `JwtAuthGuard` authenticates the token; `RolesGuard` validates `@Roles(...)` metadata.
2. **Tier 2 (Database Query Scoping)**: Security is enforced at the database query layer to eliminate Insecure Direct Object Reference (IDOR) vulnerabilities:
   - `SALES`: Scoped strictly to creator (`WHERE id = :id AND createdById = :userId`).
   - `REVIEWER`: Scoped strictly to assignee (`WHERE id = :id AND assignedReviewerId = :userId`).
   - `ADMIN`: Unscoped operational access (`WHERE id = :id`).

### 6.2 Anti-Enumeration Response Codes
- `401 Unauthorized`: Missing, expired, or malformed JWT token.
- `403 Forbidden`: Role fundamentally barred from the route (e.g. `SALES` calling reviewer decision routes, `ADMIN` calling reviewer decision routes).
- `404 Not Found`: Returned when a `SALES` or `REVIEWER` user queries an existing application outside their scope. Returning `404` instead of `403` prevents unauthorized users from enumerating whether specific resource IDs exist.
- `409 Conflict`: Target application state transition violates lifecycle invariants.
- `400 Bad Request`: Input payload validation failure (e.g. missing decision note).

### 6.3 Object-Level Scoped Query Flow (`GET /applications/:id`)
```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (e.g. sales-1)
    participant Guards as JwtAuthGuard
    participant AppCtrl as ApplicationsController
    participant AppSvc as ApplicationsService
    participant DB as PostgreSQL (TypeORM)

    Client->>Guards: GET /applications/:id (Bearer JWT)
    Guards->>AppCtrl: forward request (user payload)
    AppCtrl->>AppSvc: findOne(id, user)
    
    note over AppSvc,DB: Scoping logic in query prevents data leakage
    alt user.role == 'SALES'
        AppSvc->>DB: SELECT * FROM merchant_applications WHERE id = :id AND createdById = :userId
    else user.role == 'REVIEWER'
        AppSvc->>DB: SELECT * FROM merchant_applications WHERE id = :id AND assignedReviewerId = :userId
    else user.role == 'ADMIN'
        AppSvc->>DB: SELECT * FROM merchant_applications WHERE id = :id
    end

    alt Application record not found in scoped query
        DB-->>AppSvc: null
        AppSvc-->>AppCtrl: throw NotFoundException("Application not found")
        AppCtrl-->>Client: 404 Not Found (avoids confirming record exists)
    else Record found
        DB-->>AppSvc: MerchantApplication
        AppSvc-->>AppCtrl: MerchantApplication
        AppCtrl-->>Client: 200 OK { application data }
    end
```

## 7. Audit and sensitive data

Audited actions: `APPLICATION_CREATED`, `APPLICATION_UPDATED`, `APPLICATION_SUBMITTED`, `REVIEWER_ASSIGNED`, `DECISION_RECORDED`, `RISK_REVIEW_COMPLETED`, `RISK_REVIEW_FAILED`.

- Metadata stores changed field names plus redacted values, never full payloads.
- One redaction helper strips or masks keys such as `password`, `passwordHash`, `token`, `authorization`, `secret`, and masks `ownerEmail` and `ownerPhone`.
- Passwords and tokens are never logged (app logs or audit).
- Passwords are hashed with bcrypt.
- Fields that would need field-level encryption in production: `ownerEmail`, `ownerPhone`, and any future tax ID, national ID or bank account. Documented only, not implemented (approach: AES-256-GCM with a KMS-managed key).
- All seed data is fake. No real personal or card data.

## 8. Decisions and trade-offs

| Decision | Reason |
|---|---|
| 4 entities, `role` as an enum column | Matches DDD bounded context. Dynamic role tables add premature abstraction for 3 fixed personas. |
| ADMIN cannot decide | Enforces strict segregation of duties; prevents administrative override on risk decisions. |
| 404 for objects outside the caller's scope | No existence leak. |
| Scoping in the query, not only guards | Guards cannot know object ownership. A missed check there is the classic bypass. |
| `submissionVersion` | A resubmission gets a fresh risk review. Retries of one submission never duplicate. |
| State machine as a pure function | Easy to unit test, single source of truth. |
| Page/limit pagination | Simple, enough for this scope. |
| PostgreSQL for audit | Provides transactional ACID consistency with application state changes; avoids multi-database operational complexity. |
| Short-lived JWT, no refresh tokens | Prioritizes core authorization. Trade-off: role changes take effect after token expiry; production would add refresh tokens. |
| Enqueue after DB commit | Avoids a job running before its data exists. Trade-off: a crash between commit and enqueue leaves `PENDING` with no job. Production fix: transactional outbox. |
| Fake KYB is deterministic | Makes retry and flagged paths testable. |

## 9. Out of scope

Webhook callback, MongoDB audit store, separate ADR, refresh tokens, password reset, user registration, audit-log read endpoint, manual risk re-run endpoint, dead-letter queue, rate limiting, real field-level encryption.
