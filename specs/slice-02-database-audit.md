# Slice 2 Specification: Database Layer & Audit Module

> **Status:** `COMPLETED`  
> **Target Commit:** `feat(audit): setup typeorm migrations, audit module, centralized exception filter and logging interceptor`  
> **Relevant Architecture Sections:** [DESIGN.md Section 2 & 2.1](../DESIGN.md#2-entities--database-schema), [Section 7](../DESIGN.md#7-sensitive-data--audit-logging), [AGENTS.md Section 2 & 5](../AGENTS.md#2-system-architecture--boundaries)  

---

## 1. Objective & Scope

Establish the robust relational database foundation with PostgreSQL 16 and TypeORM 0.3+, ensuring `synchronize: false` across all environments. Build the append-only `AuditLog` module and the PII data scrubbing utility before any business entities are built, ensuring all future lifecycle actions write compliant audit records naturally.

---

## 2. Granular Task Breakdown

### Task 2.1: TypeORM DataSource & Database Module Configuration
- **What:** Configure NestJS TypeORM integration and standalone TypeORM DataSource CLI configuration.
- **Files:**
  - `src/database/data-source.ts`: TypeORM DataSource instance for migrations CLI.
  - `src/database/database.module.ts`: NestJS TypeORM root async module injecting `ConfigService`.
  - `src/app.module.ts`: Import `DatabaseModule`.
- **Invariants:**
  - `synchronize: false` strictly enforced.
  - Connection parameters read from `ConfigService` (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`).
- **Verification:** Start app and verify successful connection to PostgreSQL container.

---

### Task 2.2: Sensitive Data Masking Utility & Unit Tests
- **What:** Pure utility function `maskSensitiveData(payload)` that scrubs sensitive information (PII, credentials, payment tokens) before logging or persisting audit metadata.
- **Files:**
  - `src/common/utils/data-masking.util.ts`: Recursive object cleaner with regex masking for:
    - Emails: `j***e@domain.com`
    - Phones: `+1 ***-***-1234`
    - Passwords/tokens/secrets: `[REDACTED]`
  - `src/common/utils/data-masking.util.spec.ts`: Exhaustive Jest unit tests verifying pattern matching, nested objects, and immutability.
- **Verification:** Run `npm test` and verify 100% pass on masking logic.

---

### Task 2.3: AuditLog Entity & Initial Database Migration
- **What:** Define the `AuditLog` database entity and generate the first reviewed SQL migration file.
- **Files:**
  - `src/modules/audit/entities/audit-log.entity.ts`:
    - `id`: UUID v4 primary key (`@PrimaryGeneratedColumn('uuid')`).
    - `entityName`: string (e.g. `'MerchantApplication'`).
    - `entityId`: UUID string.
    - `action`: string (e.g. `'APPLICATION_CREATED'`, `'STATUS_TRANSITION'`).
    - `actorId`: UUID string (or `'SYSTEM'`).
    - `actorRole`: string (`'ADMIN'`, `'REVIEWER'`, `'SALES'`, `'SYSTEM'`).
    - `metadata`: JSONB column holding masked event context.
    - `createdAt`: Timestamp with timezone.
  - `src/database/migrations/1700000001000-CreateAuditLogsTable.ts`: Handcrafted, reviewed TypeORM migration with `up()` and `down()` methods.
- **Verification:** Run `npm run migration:run` against local PostgreSQL and inspect table creation in database.

---

### Task 2.4: AuditService & AuditModule (Transactional Logger)
- **What:** Build the service that handles audit log creation, automatically scrubbing PII and supporting execution inside external database transactions.
- **Files:**
  - `src/modules/audit/audit.service.ts`:
    - `log(event: CreateAuditLogDto, entityManager?: EntityManager)`: Writes audit record, optionally using an existing transaction manager to guarantee ACID coupling with business changes.
  - `src/modules/audit/audit.module.ts`: Exports `AuditService` for dependency injection across other modules.
  - `src/modules/audit/audit.service.spec.ts`: Unit test proving `AuditService` calls `maskSensitiveData` on metadata before saving.
- **Verification:** Run `npm test` to verify service tests pass.

---

### Task 2.5: Audit Logs Query Endpoint & Swagger Documentation
- **What:** Expose a read-only endpoint for compliance inspection, automatically documented in Swagger UI.
- **Files:**
  - `src/modules/audit/audit.controller.ts`:
    - `GET /audit-logs`: Returns paginated audit trail ordered by `createdAt DESC`.
    - Annotated with `@ApiTags('Audit')`, `@ApiOperation(...)`, and query filters.
- **Verification:** Verify in Swagger UI at `http://localhost:3000/api/docs` and test with curl.

---

### Task 2.6: Centralized Error Handling & Logging Interceptor
- **What:** Implement standardized, production-grade exception filter and request logging interceptor across all HTTP endpoints.
- **Files:**
  - `src/common/filters/http-exception.filter.ts`:
    - Catches all exceptions (`HttpException` and unhandled 500 errors).
    - Formats uniform JSON error response: `{ statusCode, timestamp, path, message, error }`.
    - Sanitizes internal server errors (500) so SQL queries and internal stack traces are never leaked to external clients.
  - `src/common/filters/http-exception.filter.spec.ts`: Unit tests verifying error format, status code propagation, and 500 sanitization.
  - `src/common/interceptors/logging.interceptor.ts`:
    - Intercepts requests and responses.
    - Logs HTTP method, URL path, response status code, and execution duration (ms).
  - `src/common/interceptors/logging.interceptor.spec.ts`: Unit tests verifying execution time measurement and logging.
  - `src/main.ts`: Bind `HttpExceptionFilter` and `LoggingInterceptor` globally.
- **Verification:** Unit tests pass with 100% coverage; error responses return normalized contract.

---

### Task 2.7: Test Suite Execution & Documentation
- **What:** Execute complete test suite and update documentation.
- **Files:**
  - `README.md`: Update development checklist.
  - `specs/slice-02-database-audit.md`: Mark `COMPLETED`.
- **Commit:** `feat(audit): setup typeorm migrations, audit module, centralized exception filter and logging interceptor`.

---

## 3. Verification & Acceptance Criteria

Before marking Slice 2 as complete:
- [x] `synchronize: false` verified in both runtime config and CLI DataSource.
- [x] PostgreSQL connection succeeds and logs cleanly during application startup.
- [x] `maskSensitiveData` utility passes unit tests (masks emails, phones, removes passwords).
- [x] Initial migration executes cleanly via `npm run migration:run` and reverts cleanly via `npm run migration:revert`.
- [x] `audit_logs` table exists in PostgreSQL with UUID primary key, JSONB metadata, and proper indexes.
- [x] `AuditService` can persist audit records both standalone and inside an external transaction.
- [x] `GET /audit-logs` endpoint works and is documented in Swagger at `/api/docs`.
- [x] `HttpExceptionFilter` intercepts 4xx and 5xx errors, returning standardized JSON with zero internal stack traces leaked.
- [x] `LoggingInterceptor` measures execution duration and logs request completion cleanly.
- [x] Unit and integration test suites pass with zero failures.
