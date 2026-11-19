# Slice 7 Specification: Production Hardening, Security & Operational Readiness

## 1. Objective & Scope

Slice 7 represents the final production hardening, security auditing, and end-to-end operational verification of the **Merchant Onboarding & Risk Review API**.

This slice consolidates:
1. **Centralized Exception Handling & Sanitization**: Global `HttpExceptionFilter` preventing internal stack trace leaks while formatting uniform `{ statusCode, timestamp, path, message, error }` responses.
2. **Anti-Mass Assignment & Request Validation**: Global `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
3. **Observability & Request Logging**: Global `LoggingInterceptor` tracking HTTP method, route, status code, latency in milliseconds, and `X-Request-Id` correlation headers.
4. **Targeted Login Rate Limiting (Anti-Brute Force)**: Configured via `@nestjs/throttler` strictly on `POST /auth/login` (5 attempts / minute per IP) to prevent password dictionary attacks and Bcrypt CPU starvation (~70ms per hash), while keeping internal back-office endpoints unthrottled.
5. **HTTP Security Headers & Anti-DoS**: `helmet` headers with custom CSP directives for Swagger UI (`/api/docs`), standard CORS, and `100kb` request body parser limits.
6. **PII Diff Redaction Fix**: Recursive `maskSensitiveData` utility propagating `parentKey` to sanitize update diffs (`{ changes: { ownerEmail: { from, to } } }`).
7. **Administrative Audit Inspection Endpoint (`GET /audit-logs`)**: Scoped to `ADMIN` users with pagination (`limit`, `offset`) and filtering (`entityId`, `entityName`) to allow live verification of audit entries and PII masking.
8. **Transaction Context Isolation**: Ensuring all operations inside `dataSource.transaction` use the transactional `manager` (e.g. `manager.findOne(User)` in `assignReviewer`).
9. **Complete OpenAPI / Swagger Specification**: Live documentation at `/api/docs` with Bearer auth and full model contracts across all endpoints.
10. **Multi-Tier Test Suite Verification**: Complete pass across hermetic unit tests (23 test suites, 207 tests) and real PostgreSQL 16 / Redis 7 end-to-end integration tests.

---

## 2. Hardening Invariants & Implemented Controls

### 2.1 Centralized Exception Sanitization
- **File**: `src/common/filters/http-exception.filter.ts`
- **Behavior**:
  - Catches all `HttpException` instances and extracts status code, message, and error name.
  - Catches unhandled runtime exceptions (`500 Internal Server Error`), logs the full error stack internally via NestJS `Logger`, but returns a generic `'Internal server error'` message to clients to prevent reconnaissance or internal server fingerprinting.
  - Generates RFC-compliant JSON payload:
    ```json
    {
      "statusCode": 409,
      "timestamp": "2026-11-19T14:30:00.000Z",
      "path": "/applications/123e4567-e89b-12d3-a456-426614174000/decision",
      "message": "Automated risk review is still in progress. Reviewer decisions are gated until completion.",
      "error": "ConflictException"
    }
    ```

### 2.2 Global Anti-Mass-Assignment Enforcement
- **File**: `src/main.ts`
- **Behavior**:
  - `whitelist: true`: Strips non-decorated properties from request payloads.
  - `forbidNonWhitelisted: true`: Strictly rejects requests containing unexpected properties with `400 Bad Request`.
  - Prevents attackers from passing unexpected fields (e.g. attempting to pass `status: 'APPROVED'` or `submissionVersion: 999` to `POST /applications`).

### 2.3 Targeted Rate Limiting (`POST /auth/login`)
- **File**: `src/modules/auth/auth.controller.ts`, `src/app.module.ts`
- **Behavior**:
  - `POST /auth/login` is the only public, unauthenticated endpoint in the application.
  - Decorated with `@UseGuards(ThrottlerGuard)` and `@Throttle({ default: { limit: 5, ttl: 60000 } })`.
  - Protects against credential stuffing and Bcrypt CPU starvation (10 salt rounds = ~70ms CPU per hash).
  - Authenticated back-office endpoints (`/applications`, `/users`, `/audit-logs`) remain unthrottled so that internal staff are not interrupted with false `429 Too Many Requests` during high-volume workflows.

### 2.4 HTTP Security Headers & Anti-DoS Controls
- **File**: `src/main.ts`
- **Behavior**:
  - `helmet`: Activates HSTS, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: SAMEORIGIN`.
  - Swagger CSP Directives: Configured with `styleSrc: ["'self'", "'unsafe-inline'"]` and `scriptSrc: ["'self'", "https: 'unsafe-inline'"]` to allow interactive Swagger UI rendering at `/api/docs`.
  - Body Parser Limits: Explicitly pinned to `100kb` (`json({ limit: '100kb' })`) to prevent memory exhaustion DoS attacks.
  - CORS: Standard `app.enableCors()` allowing seamless connection for developer tooling and client testing without premature domain restriction.

### 2.5 PII Diff Redaction in Audit Logs
- **File**: `src/common/utils/data-masking.util.ts`
- **Behavior**:
  - Propagates `parentKey` in recursive calls so that update diff objects like `{ ownerEmail: { from: 'old@example.com', to: 'new@example.com' } }` are masked correctly (`{ from: 'o***d@example.com', to: 'n***w@example.com' }`).
  - Unit tested in `data-masking.util.spec.ts`.

### 2.6 Administrative Audit Trail Endpoint (`GET /audit-logs`)
- **File**: `src/modules/audit/audit.controller.ts`, `src/modules/audit/audit.service.ts`
- **Behavior**:
  - Exposes `GET /audit-logs?entityId=&action=&limit=&offset=` restricted to `ADMIN` users (`@Roles(UserRole.ADMIN)`).
  - Enables compliance inspection and evaluator verification of the immutable audit trail and PII masking directly in Swagger UI without requiring CLI `psql` access.

### 2.7 Transaction Context Isolation
- **File**: `src/modules/applications/applications.service.ts`
- **Behavior**:
  - Inside `dataSource.transaction(async manager => ...)`, all operations strictly use `manager` (e.g. `manager.findOne(User, { where: { id: dto.reviewerId } })`), ensuring Unit of Work integrity and rollback safety.

---

## 3. Automated Test Suite Structure

The system is validated by a two-tier testing pyramid:

| Tier | File Path | Scope & Assertions |
|---|---|---|
| **Unit** | `src/**/*.spec.ts` (23 suites, 207 tests) | Pure state machine (`canTransition`, `getNextStatus`), DTO validation rules, data masking utilities with diff redaction, service logic, BullMQ producer options, exception filter formatting, and health controller. |
| **E2E** | `test/auth.e2e-spec.ts` | JWT issuance, bcrypt authentication, role route guards (`JwtAuthGuard`, `RolesGuard`). |
| **E2E** | `test/applications.e2e-spec.ts` | Application CRUD, Tier-2 query scoping (`createdById`), 404 anti-enumeration for Sales users. |
| **E2E** | `test/lifecycle.e2e-spec.ts` | Full lifecycle transitions: DRAFT $\rightarrow$ SUBMITTED $\rightarrow$ Gated $\rightarrow$ APPROVED / REJECTED / INFO_REQUESTED. |
| **E2E** | `test/risk.e2e-spec.ts` | Real PostgreSQL 16 & Redis 7 concurrency: parallel submit race, concurrent decision race, worker lost-update protection, queue failure recovery, relational unique constraint collision (`23505`). |

---

## 4. Acceptance Criteria Checklist

- [x] All 23 hermetic unit test suites pass (`npm test`: 207/207 passing).
- [x] Application builds with zero TypeScript compilation errors (`npm run build`).
- [x] Centralized exception filter registered globally in `main.ts`.
- [x] Global validation pipe enforces strict property whitelisting.
- [x] Rate limiting active on `POST /auth/login` (5 req/min) via `@nestjs/throttler`.
- [x] Helmet security headers, strict CORS, and 100kb payload size limit active.
- [x] Sensitive PII and secrets are redacted from audit trails including update diffs.
- [x] `GET /audit-logs` endpoint available for Admin compliance inspection.
- [x] Transaction context isolation enforced with `manager.findOne` in `assignReviewer`.
- [x] Database migrations run cleanly on fresh PostgreSQL database (`npm run migration:run`).
- [x] Seed script cleanly provisions 5 deterministic persona accounts (`npm run seed`).
- [x] Interactive OpenAPI / Swagger UI accessible at `/api/docs`.
- [x] Complete manual testing and edge-case testing matrix documented in `.local/manual_testing_and_edge_cases_guide.md`.
