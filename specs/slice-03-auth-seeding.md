# Slice 3 Specification: Authentication, RBAC & User Seeding

> **Status:** `COMPLETED`  
> **Target Commit:** `feat(auth): implement jwt authentication, rbac guards and user seeding`  
> **Relevant Architecture Sections:** [DESIGN.md Section 2.1](../DESIGN.md#2-entities--database-schema), [Section 3.1 & 3.2](../DESIGN.md#3-authentication--two-tier-authorization), [AGENTS.md Section 3](../AGENTS.md#3-mandatory-security--object-level-authorization-invariants)  

---

## 1. Objective & Scope

Implement secure authentication and role-based access control (RBAC). Issue signed JSON Web Tokens (JWT) containing user identity and role claims. Enforce route protection via NestJS guards and provide custom parameter decorators for extracting the authenticated user. Seed the database idempotently with the 5 required deterministic test accounts spanning the three authorized roles (`ADMIN`, `REVIEWER`, `SALES`).

---

## 2. Granular Task Breakdown

### Task 3.1: User Entity, Role Enum & Migration
- **What:** Define the `User` entity and generate migration `1700000002000-CreateUsersTable.ts`.
- **Files:**
  - `src/modules/users/entities/user.entity.ts`:
    - `id`: UUID v4 primary key (`@PrimaryGeneratedColumn('uuid')`).
    - `email`: string, unique, indexed (`@Column({ unique: true })`).
    - `passwordHash`: string, excluded from default serialization (`@Column({ select: false })`).
    - `role`: enum (`ADMIN`, `REVIEWER`, `SALES`).
    - `createdAt`: timestamptz.
    - `updatedAt`: timestamptz.
  - `src/modules/users/enums/user-role.enum.ts`: `UserRole` enum (`ADMIN`, `REVIEWER`, `SALES`).
  - `src/database/migrations/1700000002000-CreateUsersTable.ts`: TypeORM migration with `up()` and `down()`.
- **Invariants:**
  - `passwordHash` must never be returned in API query responses or logged.
  - Email column is indexed with unique constraint to prevent duplicate accounts.
- **Verification:** Run `npm run build` and `npm run migration:run` to verify schema generation.

---

### Task 3.2: Password Hashing Service & Unit Tests
- **What:** Service to handle bcrypt password hashing and constant-time validation.
- **Files:**
  - `src/modules/auth/password.service.ts`:
    - `hash(password: string): Promise<string>` using bcrypt with cost factor 10.
    - `compare(password: string, hash: string): Promise<boolean>` using timing-safe comparison.
  - `src/modules/auth/password.service.spec.ts`: Unit tests verifying salt generation, verification success, and rejection on mismatch.
- **Verification:** Run `npm test -- password.service.spec.ts` (100% pass).

---

### Task 3.3: JWT Strategy & Login Endpoint
- **What:** Issue signed JWT tokens on valid credentials and expose `POST /auth/login`.
- **Files:**
  - `src/modules/auth/dto/login.dto.ts`: `email` (valid email) and `password` (string).
  - `src/modules/auth/strategies/jwt.strategy.ts`: Passport JWT strategy extracting Bearer token and validating payload `{ sub: userId, email, role }`.
  - `src/modules/auth/auth.service.ts`: `login(email, password)` validating credentials and signing JWT.
  - `src/modules/auth/auth.controller.ts`:
    - `POST /auth/login`: Public endpoint returning `{ accessToken, expiresIn, user: { id, email, role } }`.
    - Documented with Swagger `@ApiTags('Authentication')`, `@ApiOperation(...)`.
  - `src/modules/auth/auth.module.ts`: Configures `PassportModule` and `JwtModule` with `JWT_SECRET` and `JWT_EXPIRES_IN`.
- **Verification:** Unit tests in `auth.service.spec.ts` and `auth.controller.spec.ts`.

---

### Task 3.4: Route Guards & Custom Decorators
- **What:** Enforce Tier 1 route-level authentication and role checks.
- **Files:**
  - `src/common/guards/jwt-auth.guard.ts`: Extends Passport `AuthGuard('jwt')`.
  - `src/common/guards/roles.guard.ts`: Checks `@Roles(...)` metadata against `request.user.role`. Throws `403 Forbidden` if role is insufficient.
  - `src/common/decorators/roles.decorator.ts`: `@Roles(...roles: UserRole[])` metadata setter.
  - `src/common/decorators/current-user.decorator.ts`: `@CurrentUser()` parameter decorator extracting authenticated user from request.
  - Unit tests: `roles.guard.spec.ts`.
- **Verification:** Run `npm test -- roles.guard.spec.ts`.

---

### Task 3.5: Deterministic Database Seeder Script
- **What:** Idempotent database seeder script populating the 5 required test accounts.
- **Files:**
  - `src/database/seeds/seed.ts`:
    - Checks for existing user before insert (idempotent `upsert` or skip if exists).
    - Seeds 5 deterministic synthetic accounts:
      - `admin@example.com` (`ADMIN`, password `Password123!`)
      - `reviewer1@example.com` (`REVIEWER`, password `Password123!`)
      - `reviewer2@example.com` (`REVIEWER`, password `Password123!`)
      - `sales1@example.com` (`SALES`, password `Password123!`)
      - `sales2@example.com` (`SALES`, password `Password123!`)
  - `package.json`: Add `"seed": "ts-node -r tsconfig-paths/register src/database/seeds/seed.ts"`.
- **Verification:** Run `npm run seed` twice; verify zero duplicate key errors and accounts exist in DB.

---

### Task 3.6: Authentication E2E Integration Tests & Slice Sign-off
- **What:** Supertest end-to-end integration tests verifying login, token issuance, and guard rejection.
- **Files:**
  - `test/auth.e2e-spec.ts`:
    - Successful login with valid credentials (returns 200 and valid JWT).
    - Failed login with invalid password (returns 401 Unauthorized).
    - Failed login with non-existent user (returns 401 Unauthorized, timing-safe).
    - Protected route rejection without token (returns 401 Unauthorized).
    - Protected route rejection with invalid role (returns 403 Forbidden).
    - Compliance audit trail route (`GET /audit-logs`) locked down: anonymous (401), sales/reviewer (403), admin (200).
    - Real-world attack edge cases: mass assignment whitelist injection (400), malformed headers (401), signature tampering (401).
  - `README.md`: Update checklist for Slice 3.
  - `specs/slice-03-auth-seeding.md`: Mark `COMPLETED`.
- **Commit:** `feat(auth): implement jwt authentication, rbac guards and user seeding`.

---

## 3. Verification & Acceptance Criteria

Before marking Slice 3 as complete:
- [x] `User` entity has strict types, unique indexed `email`, and `passwordHash` hidden by default.
- [x] Migration `1700000002000-CreateUsersTable.ts` runs and reverts cleanly.
- [x] Bcrypt password service hashes passwords with salt factor 10.
- [x] `POST /auth/login` issues valid JWT containing `{ sub, email, role }`.
- [x] `JwtAuthGuard` blocks unauthorized requests with `401 Unauthorized`.
- [x] `RolesGuard` blocks insufficient roles with `403 Forbidden`.
- [x] Seeder creates exactly 5 deterministic users idempotently.
- [x] All unit and E2E integration tests pass 100% with zero failures.
