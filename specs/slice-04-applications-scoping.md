# Slice 4 Specification: Merchant Applications & Query Scoping

> **Status:** `IN_PROGRESS`  
> **Target Commit:** `feat(applications): implement merchant applications data model, pure state machine and scoped queries`  
> **Relevant Architecture Sections:** [DESIGN.md Section 2 (Entities)](../DESIGN.md#2-entities), [Section 4 (State Machine)](../DESIGN.md#4-status-model-and-lifecycle-state-machine), [Section 6 (Two-Tier Authorization)](../DESIGN.md#6-authorization--object-level-scoping), [AGENTS.md Section 3 (Security Invariants)](../AGENTS.md#3-mandatory-security--object-level-authorization-invariants)  

---

## 1. Objective & Scope

Implement the core `MerchantApplication` domain entity, database migration, and lifecycle management. Build a side-effect-free pure state machine validator (`canTransition`, `getNextStatus`, `isEditable`) that serves as the single source of truth for all application state transitions. 

Expose application CRUD endpoints enforcing **Two-Tier Authorization**:
1. **Tier 1 (Route Level):** `JwtAuthGuard` and `RolesGuard` validating JWT token claims against `@Roles(...)` metadata.
2. **Tier 2 (Database Query Scoping - Anti-IDOR):** Scoping SQL queries strictly by caller identity:
   - `SALES`: Scoped strictly by `createdById = :userId`.
   - `REVIEWER`: Scoped strictly by `assignedReviewerId = :userId`.
   - `ADMIN`: Unscoped operational access.

Enforce the **Anti-Enumeration Invariant**: When an authenticated user queries or attempts to modify an application outside their authorization scope, return **`404 Not Found`** (never `403 Forbidden`) to prevent resource ID enumeration attacks.

---

## 2. Granular Task Breakdown

### Task 4.1: Merchant Application Entity, Enums & Database Migration
- **What:** Define the `MerchantApplication` TypeORM entity, domain enums, and generate schema migration `1700000003000-CreateMerchantApplicationsTable.ts`.
- **Files:**
  - `src/modules/applications/enums/application-status.enum.ts`:
    - `DRAFT`: Initial state upon creation; fully editable.
    - `SUBMITTED`: Under review; locked against edits.
    - `INFO_REQUESTED`: Reviewer requested clarifications; re-opened for editing by Sales.
    - `APPROVED`: Terminal approved state; immutable.
    - `REJECTED`: Terminal declined state; immutable.
  - `src/modules/applications/enums/risk-status.enum.ts`:
    - `NOT_STARTED`: Initial state while application is in `DRAFT`.
    - `PENDING`: Background KYB verification in progress via BullMQ.
    - `PASSED`: Verification passed.
    - `FLAGGED`: Verification advisory flag.
    - `FAILED`: Verification exhausted all retries.
  - `src/modules/applications/enums/business-type.enum.ts`:
    - `INDIVIDUAL`, `SOLE_PROPRIETORSHIP`, `LLC`, `CORPORATION`, `PARTNERSHIP`.
  - `src/modules/applications/entities/merchant-application.entity.ts`:
    - `id`: UUID v4 primary key (`@PrimaryGeneratedColumn('uuid')`).
    - `businessName`: string (`varchar(255)`).
    - `legalBusinessName`: string (`varchar(255)`).
    - `businessType`: enum `BusinessType`.
    - `ownerName`: string (`varchar(255)`).
    - `ownerEmail`: string (`varchar(255)`).
    - `ownerPhone`: string (`varchar(50)`).
    - `requestedMonthlyVolume`: decimal (`numeric(12, 2)`).
    - `requestedAvgTicket`: decimal (`numeric(10, 2)`).
    - `status`: enum `ApplicationStatus` (default: `DRAFT`).
    - `riskStatus`: enum `RiskStatus` (default: `NOT_STARTED`).
    - `submissionVersion`: integer (default: 0).
    - `createdById`: UUID (FK referencing `users.id`).
    - `createdBy`: `@ManyToOne(() => User)` relation.
    - `assignedReviewerId`: UUID, nullable (FK referencing `users.id`).
    - `assignedReviewer`: `@ManyToOne(() => User, { nullable: true })` relation.
    - `decisionNote`: text, nullable.
    - `decidedAt`: timestamptz, nullable.
    - `createdAt`: timestamptz.
    - `updatedAt`: timestamptz.
  - `src/database/migrations/1700000003000-CreateMerchantApplicationsTable.ts`:
    - Creates table `merchant_applications`.
    - Creates B-Tree indexes on `createdById`, `assignedReviewerId`, and `status`.
    - Creates foreign key constraints referencing `users(id)` with `ON DELETE RESTRICT`.
- **Invariants:**
  - `synchronize: false` maintained; schema changes applied strictly through reviewed migrations.
  - Proper index coverage ensures fast execution of scoped queries.
- **Verification:** Run `npm run build` and `npm run migration:run`. Unit test `merchant-application.entity.spec.ts`.

---

### Task 4.2: Pure State Machine & Exhaustive Unit Tests
- **What:** Standalone, pure functional state machine validator without side effects or database dependencies.
- **Files:**
  - `src/modules/applications/enums/application-action.enum.ts`:
    - Actions: `SUBMIT`, `RESUBMIT`, `ASSIGN`, `APPROVE`, `REJECT`, `REQUEST_INFO`.
  - `src/modules/applications/state-machine/applications.state-machine.ts`:
    - `canTransition(currentStatus: ApplicationStatus, action: ApplicationAction): boolean`: Validates if action is permitted.
    - `getNextStatus(currentStatus: ApplicationStatus, action: ApplicationAction): ApplicationStatus`: Computes next state; throws error if transition is invalid.
    - `isEditable(status: ApplicationStatus): boolean`: Returns `true` only for `DRAFT` and `INFO_REQUESTED`.
    - `isTerminal(status: ApplicationStatus): boolean`: Returns `true` only for `APPROVED` and `REJECTED`.
  - `src/modules/applications/state-machine/applications.state-machine.spec.ts`:
    - Exhaustive matrix test covering all status x action combinations.
    - Explicit verification of immutable terminal states (`APPROVED`, `REJECTED`).
    - Verification of editability lockdown.
- **Invariants:**
  - Single source of truth for application lifecycle transitions across services and workers.
  - Zero external I/O or database dependencies inside the state machine.
- **Verification:** Run `npm test -- applications.state-machine.spec.ts` (100% pass).

---

### Task 4.3: DTOs, Query Filters & Swagger Documentation Architecture
- **What:** Input validation schemas and OpenAPI documentation completely decoupled from controllers.
- **Files:**
  - `src/modules/applications/dto/create-application.dto.ts`:
    - `businessName`: string, minLength 2, maxLength 255.
    - `legalBusinessName`: string, minLength 2, maxLength 255.
    - `businessType`: IsEnum(BusinessType).
    - `ownerName`: string, minLength 2, maxLength 255.
    - `ownerEmail`: IsEmail, normalized with lowercase and trim.
    - `ownerPhone`: string, matches phone format.
    - `requestedMonthlyVolume`: IsNumber, IsPositive, Min 1.
    - `requestedAvgTicket`: IsNumber, IsPositive, Min 1.
  - `src/modules/applications/dto/update-application.dto.ts`:
    - `PartialType(CreateApplicationDto)`.
  - `src/modules/applications/dto/query-applications.dto.ts`:
    - `page`: Type(() => Number), IsInt, Min 1, default 1.
    - `limit`: Type(() => Number), IsInt, Min 1, Max 100, default 20.
    - `status`: IsOptional, IsEnum(ApplicationStatus).
  - `src/modules/applications/docs/applications.swagger.ts`:
    - `@ApiApplicationsDocs()`: ApiTags('Applications'), ApiBearerAuth().
    - `@ApiCreateApplicationDoc()`: 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden.
    - `@ApiFindAllApplicationsDoc()`: 200 OK paginated response.
    - `@ApiFindOneApplicationDoc()`: 200 OK, 401 Unauthorized, 404 Not Found.
    - `@ApiUpdateApplicationDoc()`: 200 OK, 400 Bad Request, 401 Unauthorized, 404 Not Found, 409 Conflict.
- **Invariants:**
  - Zero Swagger decorator clutter in DTOs (relies on `@nestjs/swagger` CLI plugin and JSDoc tags).
  - Validation whitelist and forbidden non-whitelisted properties prevent mass-assignment injection attacks.
- **Verification:** Run `npm run build`.

---

### Task 4.4: Applications Service with Two-Tier Authorization & Object Scoping
- **What:** Domain service orchestrating CRUD operations, query scoping, state validation, and transactional audit logging.
- **Files:**
  - `src/modules/applications/applications.service.ts`:
    - `create(dto: CreateApplicationDto, user: AuthenticatedUser)`:
      - Sets `createdById = user.id`.
      - Executes inside a database transaction (`dataSource.transaction`).
      - Atomically inserts application and records `AuditLog` (`APPLICATION_CREATED` action, metadata redacted/masked).
      - Returns created application.
    - `findAll(user: AuthenticatedUser, query: QueryApplicationsDto)`:
      - Evaluates user role:
        - `SALES`: Applies `WHERE createdById = :userId`.
        - `REVIEWER`: Applies `WHERE assignedReviewerId = :userId`.
        - `ADMIN`: Unscoped query across all applications.
      - Applies optional `status` filter and pagination (`page`, `limit`).
      - Returns `{ data: MerchantApplication[], total: number, page: number, limit: number }`.
    - `findOne(id: string, user: AuthenticatedUser)`:
      - Executes scoped query based on `user.role`.
      - If record is not found in scoped query: Throws `NotFoundException('Application not found')` -> Returns **`404 Not Found`** (Anti-Enumeration Invariant).
    - `update(id: string, dto: UpdateApplicationDto, user: AuthenticatedUser)`:
      - Fetches application via scoped query (throws `404 Not Found` if outside caller scope).
      - Checks editability via state machine `isEditable(app.status)`. If false, throws `ConflictException` (**`409 Conflict`**).
      - Executes inside database transaction: updates application fields and records `AuditLog` (`APPLICATION_UPDATED` action with masked diff).
      - Returns updated application.
  - `src/modules/applications/applications.service.spec.ts`:
    - Unit tests validating scoping filters for each role persona.
    - Verification that queries for unauthorized IDs trigger `404 Not Found`.
    - Verification that updates to `SUBMITTED` applications throw `409 Conflict`.
    - Verification of atomic audit log generation with sensitive data redaction.
- **Invariants:**
  - Two-tier security: Database queries are strictly scoped regardless of route guards.
  - Anti-enumeration: Out-of-scope queries return 404, never 403.
  - Atomic transactions guarantee zero un-audited state changes.
- **Verification:** Run `npm test -- applications.service.spec.ts`.

---

### Task 4.5: Applications Controller & Module Integration
- **What:** Presentation layer exposing REST endpoints, bound to guards, decorators, and OpenAPI metadata.
- **Files:**
  - `src/modules/applications/applications.controller.ts`:
    - `POST /applications`: `@Roles(UserRole.SALES, UserRole.ADMIN)`.
    - `GET /applications`: `@Roles(UserRole.SALES, UserRole.REVIEWER, UserRole.ADMIN)`.
    - `GET /applications/:id`: `@Roles(UserRole.SALES, UserRole.REVIEWER, UserRole.ADMIN)`.
    - `PATCH /applications/:id`: `@Roles(UserRole.SALES, UserRole.ADMIN)`.
    - Handlers decorated with `@Api...Docs()`.
  - `src/modules/applications/applications.module.ts`:
    - Imports `TypeOrmModule.forFeature([MerchantApplication])`, `AuditModule`.
    - Providers: `ApplicationsService`.
    - Controllers: `ApplicationsController`.
    - Exports: `ApplicationsService`.
  - `src/app.module.ts`: Register `ApplicationsModule`.
  - `src/modules/applications/applications.controller.spec.ts`: Controller unit tests.
- **Verification:** Run `npm run build` and `npm test -- applications.controller.spec.ts`.

---

### Task 4.6: IDOR & Anti-Enumeration E2E Integration Suite & Documentation Sync
- **What:** Supertest end-to-end integration tests verifying query scoping, anti-enumeration, and role permissions.
- **Files:**
  - `test/applications.e2e-spec.ts`:
    - `sales1` creates Application A.
    - `sales1` retrieves Application A (`200 OK`).
    - `sales2` attempts `GET /applications/:A.id` -> returns **`404 Not Found`** (Anti-Enumeration verified; NOT `403`).
    - `sales2` attempts `PATCH /applications/:A.id` -> returns **`404 Not Found`**.
    - `reviewer1` attempts `GET /applications/:A.id` while unassigned -> returns **`404 Not Found`**.
    - `admin` retrieves `GET /applications/:A.id` -> returns **`200 OK`**.
    - `reviewer1` calls `POST /applications` -> returns **`403 Forbidden`** (Tier 1 guard check).
    - Unauthenticated request -> returns **`401 Unauthorized`**.
    - Mass-assignment injection attempt with unrecognized property -> returns **`400 Bad Request`**.
  - `README.md`: Update Slice 4 development status checklist.
  - `.local/interview-prep/04_applications_scoping.md`: Comprehensive interview preparation document detailing query scoping architecture, anti-enumeration rationale, and index efficiency.
- **Verification:** Run `npm run build`, `npm test`, and `npm run test:e2e`.

---

## 3. Acceptance Criteria & Definition of Done

- [ ] `MerchantApplication` schema migrated to PostgreSQL with indexes on `createdById`, `assignedReviewerId`, and `status`.
- [ ] Pure state machine unit tests pass with 100% path coverage.
- [ ] Tier 1 route protection enforced (`JwtAuthGuard`, `RolesGuard`).
- [ ] Tier 2 query scoping strictly isolates `SALES` and `REVIEWER` data at the SQL level.
- [ ] Unauthorized object queries return `404 Not Found` (zero ID existence leaks).
- [ ] Application updates locked with `409 Conflict` when status is not `DRAFT` or `INFO_REQUESTED`.
- [ ] Audit logs emitted atomically for `APPLICATION_CREATED` and `APPLICATION_UPDATED` with contact info masked.
- [ ] Clean controller architecture maintained: zero `@ApiProperty` boilerplate in DTOs, zero Swagger annotations cluttering controllers.
- [ ] `npm run build` compiles with 0 errors. All unit and E2E tests pass.
