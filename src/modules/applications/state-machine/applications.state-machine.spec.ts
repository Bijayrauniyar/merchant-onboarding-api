import {
  canTransition,
  getNextStatus,
  isEditable,
  isTerminal,
} from './applications.state-machine';
import { ApplicationStatus } from '../enums/application-status.enum';
import { ApplicationAction } from '../enums/application-action.enum';

describe('Applications State Machine (Pure Domain Logic)', () => {
  describe('canTransition() matrix', () => {
    const allStatuses = Object.values(ApplicationStatus);
    const allActions = Object.values(ApplicationAction);

    // Explicit set of allowed (status, action) combinations
    const allowedTransitions: [ApplicationStatus, ApplicationAction][] = [
      [ApplicationStatus.DRAFT, ApplicationAction.SUBMIT],
      [ApplicationStatus.SUBMITTED, ApplicationAction.ASSIGN],
      [ApplicationStatus.SUBMITTED, ApplicationAction.APPROVE],
      [ApplicationStatus.SUBMITTED, ApplicationAction.REJECT],
      [ApplicationStatus.SUBMITTED, ApplicationAction.REQUEST_INFO],
      [ApplicationStatus.INFO_REQUESTED, ApplicationAction.SUBMIT],
      [ApplicationStatus.INFO_REQUESTED, ApplicationAction.RESUBMIT],
    ];

    const isAllowed = (
      status: ApplicationStatus,
      action: ApplicationAction,
    ): boolean =>
      allowedTransitions.some(([s, a]) => s === status && a === action);

    allStatuses.forEach((status) => {
      describe(`When status is ${status}`, () => {
        allActions.forEach((action) => {
          const expected = isAllowed(status, action);
          it(`should return ${expected} for action ${action}`, () => {
            expect(canTransition(status, action)).toBe(expected);
          });
        });
      });
    });
  });

  describe('getNextStatus()', () => {
    it('should transition DRAFT + SUBMIT -> SUBMITTED', () => {
      expect(
        getNextStatus(ApplicationStatus.DRAFT, ApplicationAction.SUBMIT),
      ).toBe(ApplicationStatus.SUBMITTED);
    });

    it('should transition SUBMITTED + ASSIGN -> SUBMITTED (retains status on reviewer assignment)', () => {
      expect(
        getNextStatus(ApplicationStatus.SUBMITTED, ApplicationAction.ASSIGN),
      ).toBe(ApplicationStatus.SUBMITTED);
    });

    it('should transition SUBMITTED + APPROVE -> APPROVED', () => {
      expect(
        getNextStatus(ApplicationStatus.SUBMITTED, ApplicationAction.APPROVE),
      ).toBe(ApplicationStatus.APPROVED);
    });

    it('should transition SUBMITTED + REJECT -> REJECTED', () => {
      expect(
        getNextStatus(ApplicationStatus.SUBMITTED, ApplicationAction.REJECT),
      ).toBe(ApplicationStatus.REJECTED);
    });

    it('should transition SUBMITTED + REQUEST_INFO -> INFO_REQUESTED', () => {
      expect(
        getNextStatus(
          ApplicationStatus.SUBMITTED,
          ApplicationAction.REQUEST_INFO,
        ),
      ).toBe(ApplicationStatus.INFO_REQUESTED);
    });

    it('should transition INFO_REQUESTED + SUBMIT -> SUBMITTED', () => {
      expect(
        getNextStatus(
          ApplicationStatus.INFO_REQUESTED,
          ApplicationAction.SUBMIT,
        ),
      ).toBe(ApplicationStatus.SUBMITTED);
    });

    it('should transition INFO_REQUESTED + RESUBMIT -> SUBMITTED', () => {
      expect(
        getNextStatus(
          ApplicationStatus.INFO_REQUESTED,
          ApplicationAction.RESUBMIT,
        ),
      ).toBe(ApplicationStatus.SUBMITTED);
    });

    it('should throw an error on invalid transitions (e.g. DRAFT + APPROVE)', () => {
      expect(() =>
        getNextStatus(ApplicationStatus.DRAFT, ApplicationAction.APPROVE),
      ).toThrow(
        "Invalid state transition: Cannot perform action 'APPROVE' on application with status 'DRAFT'",
      );
    });

    it('should throw an error when attempting any action on terminal APPROVED state', () => {
      expect(() =>
        getNextStatus(ApplicationStatus.APPROVED, ApplicationAction.SUBMIT),
      ).toThrow(
        "Invalid state transition: Cannot perform action 'SUBMIT' on application with status 'APPROVED'",
      );
    });

    it('should throw an error when attempting any action on terminal REJECTED state', () => {
      expect(() =>
        getNextStatus(ApplicationStatus.REJECTED, ApplicationAction.RESUBMIT),
      ).toThrow(
        "Invalid state transition: Cannot perform action 'RESUBMIT' on application with status 'REJECTED'",
      );
    });
  });

  describe('isEditable()', () => {
    it('should allow editing when status is DRAFT', () => {
      expect(isEditable(ApplicationStatus.DRAFT)).toBe(true);
    });

    it('should allow editing when status is INFO_REQUESTED', () => {
      expect(isEditable(ApplicationStatus.INFO_REQUESTED)).toBe(true);
    });

    it('should disallow editing when status is SUBMITTED (locked for review)', () => {
      expect(isEditable(ApplicationStatus.SUBMITTED)).toBe(false);
    });

    it('should disallow editing when status is APPROVED (terminal state)', () => {
      expect(isEditable(ApplicationStatus.APPROVED)).toBe(false);
    });

    it('should disallow editing when status is REJECTED (terminal state)', () => {
      expect(isEditable(ApplicationStatus.REJECTED)).toBe(false);
    });
  });

  describe('isTerminal()', () => {
    it('should report APPROVED as terminal', () => {
      expect(isTerminal(ApplicationStatus.APPROVED)).toBe(true);
    });

    it('should report REJECTED as terminal', () => {
      expect(isTerminal(ApplicationStatus.REJECTED)).toBe(true);
    });

    it('should report DRAFT as non-terminal', () => {
      expect(isTerminal(ApplicationStatus.DRAFT)).toBe(false);
    });

    it('should report SUBMITTED as non-terminal', () => {
      expect(isTerminal(ApplicationStatus.SUBMITTED)).toBe(false);
    });

    it('should report INFO_REQUESTED as non-terminal', () => {
      expect(isTerminal(ApplicationStatus.INFO_REQUESTED)).toBe(false);
    });
  });
});
