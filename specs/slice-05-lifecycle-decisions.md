# Slice 5 Specification: Lifecycle Transitions & Reviewer Decisions

> **Status:** `COMPLETED`  
> **Target Commit:** `feat(applications): implement lifecycle transitions, reviewer assignment, and decision gating`  
> **Relevant Architecture Sections:** [DESIGN.md Section 4 (State Machine)](../DESIGN.md#4-status-model-and-lifecycle-state-machine), [Section 4.3 (Lifecycle Rules)](../DESIGN.md#43-lifecycle-rules--invariants), [AGENTS.md Section 3 (Security Invariants)](../AGENTS.md#3-mandatory-security--object-level-authorization-invariants)  

---

## 1. Objective & Scope

Connect the pure finite state machine to live HTTP command endpoints to govern the end-to-end merchant onboarding lifecycle:
1. **Submission (`POST /applications/:id/submit`)**: Sales submits a draft application, locking it against edits, advancing status to `SUBMITTED`, incrementing `submissionVersion`, and transitioning `riskStatus` to `PENDING`.
2. **Reviewer Assignment (`POST /applications/:id/assign`)**: Admin assigns a designated reviewer to an application in `SUBMITTED` status.
3. **Reviewer Decision (`POST /applications/:id/decision`)**: The assigned Reviewer records an official determination (`APPROVE`, `REJECT`, `REQUEST_INFO`), strictly enforcing:
   - **State Gating**: Rejects decisions with `409 Conflict` if `riskStatus == PENDING`.
   - **Decision Isolation**: Only the specific `assignedReviewerId` can record decisions (Admins receive `403 Forbidden`, unassigned Reviewers receive `404 Not Found`).
   - **Mandatory Notes**: Enforces structured explanation notes for `REJECT` and `REQUEST_INFO`.

---

## 2. Granular Task Breakdown

### Task 5.1: DTOs, Validation & Swagger Documentation Architecture
- **What:** Define request payloads for reviewer assignment and decision recording, with conditional validation for decision notes, and decoupled OpenAPI documentation.
- **Files:**
  - `src/modules/applications/dto/assign-reviewer.dto.ts`:
    - `reviewerId`: UUID v4 (`@IsUUID('4')`), mandatory.
  - `src/modules/applications/enums/reviewer-decision.enum.ts`:
    - Decisions: `APPROVE`, `REJECT`, `REQUEST_INFO`.
  - `src/modules/applications/dto/record-decision.dto.ts`:
    - `decision`: enum `ReviewerDecision`, mandatory.
    - `note`: optional for `APPROVE`, mandatory (min 5 characters) for `REJECT` and `REQUEST_INFO` via `@ValidateIf()`.
  - `src/modules/applications/docs/applications.swagger.ts`:
    - Add `@ApiSubmitApplicationDoc()`: 200 OK, 400 Bad Request, 401 Unauthorized, 404 Not Found, 409 Conflict.
    - Add `@ApiAssignReviewerDoc()`: 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict.
    - Add `@ApiRecordDecisionDoc()`: 200 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict.
  - `src/modules/applications/dto/assign-reviewer.dto.spec.ts` & `record-decision.dto.spec.ts`: Unit tests verifying conditional validation rules.
- **Verification:** Run `npm run build` and `npm test -- assign-reviewer.dto.spec.ts record-decision.dto.spec.ts`.

---

### Task 5.2: Application Submission Endpoint (`POST /applications/:id/submit`)
- **What:** Service and controller handlers to transition applications from `DRAFT` or `INFO_REQUESTED` to `SUBMITTED`.
- **Files:**
  - `src/modules/applications/applications.service.ts`:
    - `submit(id: string, user: AuthenticatedUser)`:
      - Fetches application via scoped query (404 if outside ownership).
      - Checks transition legality via `canTransition(app.status, ApplicationAction.SUBMIT)` or `RESUBMIT`. If false, throws `ConflictException` (409).
      - Executes inside transaction: updates `status = SUBMITTED`, `riskStatus = PENDING`, increments `submissionVersion += 1`.
      - Emits `APPLICATION_SUBMITTED` audit log atomically.
  - `src/modules/applications/applications.controller.ts`:
    - Handler `@Post(':id/submit')` with `@Roles(UserRole.SALES, UserRole.ADMIN)`.
- **Verification:** Run `npm test -- applications.service.spec.ts`.

---

### Task 5.3: Reviewer Assignment Endpoint (`POST /applications/:id/assign`)
- **What:** Service and controller handlers enabling Admin to assign applications in `SUBMITTED` state to qualified reviewers.
- **Files:**
  - `src/modules/applications/applications.service.ts`:
    - `assignReviewer(id: string, dto: AssignReviewerDto, adminUser: AuthenticatedUser)`:
      - Looks up application by ID (404 if not found).
      - Enforces application status invariant: must be in `SUBMITTED` status (409 Conflict if not).
      - Verifies target user exists in database and holds `UserRole.REVIEWER` (400 Bad Request if not).
      - Updates `assignedReviewerId = dto.reviewerId`.
      - Emits `REVIEWER_ASSIGNED` audit log atomically.
  - `src/modules/applications/applications.controller.ts`:
    - Handler `@Post(':id/assign')` with `@Roles(UserRole.ADMIN)` (Sales and Reviewers receive 403 Forbidden).
- **Verification:** Run `npm test -- applications.service.spec.ts`.

---

### Task 5.4: Reviewer Decision Flow & State Gating (`POST /applications/:id/decision`)
- **What:** Service and controller handlers allowing assigned reviewers to record decisions with state gating.
- **Files:**
  - `src/modules/applications/applications.service.ts`:
    - `recordDecision(id: string, dto: RecordDecisionDto, reviewer: AuthenticatedUser)`:
      - Validates caller role is `REVIEWER` (defense-in-depth).
      - Fetches application enforcing ownership (`assignedReviewerId = reviewer.id`); returns 404 Not Found if unassigned.
      - Enforces lifecycle invariant: `status == SUBMITTED` (409 Conflict if not).
      - **State Gating Invariant**: Enforces `riskStatus != PENDING` (409 Conflict if pending).
      - Maps decision to action and validates transition with `canTransition`.
      - Updates application:
        - `APPROVE`: `status = APPROVED`, `decidedAt = NOW()`, `decisionNote = dto.note || null`.
        - `REJECT`: `status = REJECTED`, `decidedAt = NOW()`, `decisionNote = dto.note`.
        - `REQUEST_INFO`: `status = INFO_REQUESTED`, `decisionNote = dto.note`.
      - Emits `DECISION_RECORDED` audit log atomically.
  - `src/modules/applications/applications.controller.ts`:
    - Handler `@Post(':id/decision')` with `@Roles(UserRole.REVIEWER)`.
- **Verification:** Run `npm test -- applications.service.spec.ts`.

---

### Task 5.5: End-to-End Integration Suite & Documentation Sync
- **What:** Comprehensive Supertest E2E integration test suite verifying the complete lifecycle progression against PostgreSQL.
- **Files:**
  - `test/lifecycle.e2e-spec.ts`:
    - Full happy path: Create -> Submit -> Assign -> Wait/Simulate Risk Check Pass -> Approve.
    - Resubmission loop: Request Info -> Re-open DRAFT/INFO_REQUESTED -> Update fields -> Resubmit -> Version increments.
    - State Gating: Assert `409 Conflict` when Reviewer attempts decision while `riskStatus == PENDING`.
    - Decision Isolation: Assert `404 Not Found` when unassigned Reviewer attempts decision.
    - Segregation of Duties: Assert `403 Forbidden` when Admin or Sales attempts to call decision endpoint.
    - Note Validation: Assert `400 Bad Request` when note is missing for `REJECT` or `REQUEST_INFO`.
  - `README.md`: Update Slice 5 status checklist.
- **Verification:** Run `npm run build`, `npm test`, and `npm run test:e2e`.

---

## 3. Acceptance Criteria & Definition of Done

- [x] `POST /applications/:id/submit` advances status to `SUBMITTED`, increments `submissionVersion`, and sets `riskStatus = PENDING`.
- [x] `POST /applications/:id/assign` restricted to Admin; assigns only users with `REVIEWER` role on `SUBMITTED` applications.
- [x] `POST /applications/:id/decision` restricted to assigned Reviewer only; other reviewers get 404, Admins/Sales get 403.
- [x] Decision endpoint blocked with `409 Conflict` if `riskStatus == PENDING`.
- [x] Mandatory note enforced for `REJECT` and `REQUEST_INFO` (min 5 chars).
- [x] All lifecycle transitions emit atomic, structured audit log entries.
- [x] `npm run build` compiles with 0 errors. All unit and E2E tests pass.
- [x] All files left unstaged in working tree for user review.
