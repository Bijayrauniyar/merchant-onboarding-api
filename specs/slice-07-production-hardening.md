# Slice 7 Specification: Production Hardening, Verification & Operational Readiness

## 1. Objective & Scope

Slice 7 represents the final production hardening, security auditing, and end-to-end operational verification of the **Merchant Onboarding & Risk Review API**.

This slice consolidates:
1. **Centralized Exception Handling & Sanitization**: Global `HttpExceptionFilter` preventing internal stack trace leaks while formatting uniform `{ statusCode, timestamp, path, message, error }` responses.
2. **Anti-Mass Assignment & Request Validation**: Global `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
3. **Observability & Request Logging**: Global `LoggingInterceptor` tracking HTTP method, route, status code, and latency in milliseconds.
4. **Complete OpenAPI / Swagger Specification**: Live documentation at `/api/docs` with Bearer auth and full model contracts across all endpoints.
5. **Zero-Secrets & Data Privacy Audit**: Verification of `.gitignore`, `.env.example`, PII data masking (`maskSensitiveData`), and password hash exclusion (`select: false`).
6. **Multi-Tier Test Suite Verification**: Complete pass across hermetic unit tests (22 test suites, 199 tests) and real PostgreSQL 16 / Redis 7 end-to-end integration tests.

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

### 2.3 Zero-Secrets & Compliance Audit
- **Git Controls**: `.env` is git-ignored; `.env.example` contains safe non-production defaults.
- **Credential Protection**: User passwords are encrypted using bcrypt (10 rounds). The `User` entity marks `passwordHash: { select: false }`, ensuring passwords are never selected by default ORM queries or serialized in responses.
- **Audit Masking**: PII metadata (`ownerEmail`, `ownerPhone`) passed to `auditService.log()` is automatically masked by `maskSensitiveData()` (e.g., `j***e@domain.com`, `+1415****671`).
- **Synthetic Data**: Seed scripts and E2E test suites use 100% synthetic, fictional merchant and personal data.

---

## 3. Automated Test Suite Structure

The system is validated by a two-tier testing pyramid:

| Tier | File Path | Scope & Assertions |
|---|---|---|
| **Unit** | `src/**/*.spec.ts` (22 suites, 199 tests) | Pure state machine (`canTransition`, `getNextStatus`), DTO validation rules, data masking utilities, service logic, BullMQ producer options, and exception filter formatting. |
| **E2E** | `test/auth.e2e-spec.ts` | JWT issuance, bcrypt authentication, role route guards (`JwtAuthGuard`, `RolesGuard`). |
| **E2E** | `test/applications.e2e-spec.ts` | Application CRUD, Tier-2 query scoping (`createdById`), 404 anti-enumeration for Sales users. |
| **E2E** | `test/lifecycle.e2e-spec.ts` | Full lifecycle transitions: DRAFT $\rightarrow$ SUBMITTED $\rightarrow$ Gated $\rightarrow$ APPROVED / REJECTED / INFO_REQUESTED. |
| **E2E** | `test/risk.e2e-spec.ts` | Real PostgreSQL 16 & Redis 7 concurrency: parallel submit race, concurrent decision race, worker lost-update protection, queue failure recovery, relational unique constraint collision (`23505`). |

---

## 4. Acceptance Criteria Checklist

- [x] All 22 hermetic unit test suites pass (`npm test`: 199/199 passing).
- [x] Application builds with zero TypeScript compilation errors (`npm run build`).
- [x] Centralized exception filter registered globally in `main.ts`.
- [x] Global validation pipe enforces strict property whitelisting.
- [x] Sensitive PII and secrets are redacted from audit trails.
- [x] Database migrations run cleanly on fresh PostgreSQL database (`npm run migration:run`).
- [x] Seed script cleanly provisions 5 deterministic persona accounts (`npm run seed`).
- [x] Interactive OpenAPI / Swagger UI accessible at `/api/docs`.
- [x] Complete manual testing and edge-case testing matrix documented in `.local/manual_testing_and_edge_cases_guide.md`.
