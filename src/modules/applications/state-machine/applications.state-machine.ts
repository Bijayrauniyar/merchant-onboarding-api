import { ApplicationStatus } from '../enums/application-status.enum';
import { ApplicationAction } from '../enums/application-action.enum';

/**
 * Transition map defining allowable actions for each ApplicationStatus
 * and their resulting target ApplicationStatus.
 */
const TRANSITION_MAP: Record<
  ApplicationStatus,
  Partial<Record<ApplicationAction, ApplicationStatus>>
> = {
  [ApplicationStatus.DRAFT]: {
    [ApplicationAction.SUBMIT]: ApplicationStatus.SUBMITTED,
  },
  [ApplicationStatus.SUBMITTED]: {
    [ApplicationAction.ASSIGN]: ApplicationStatus.SUBMITTED,
    [ApplicationAction.APPROVE]: ApplicationStatus.APPROVED,
    [ApplicationAction.REJECT]: ApplicationStatus.REJECTED,
    [ApplicationAction.REQUEST_INFO]: ApplicationStatus.INFO_REQUESTED,
  },
  [ApplicationStatus.INFO_REQUESTED]: {
    [ApplicationAction.SUBMIT]: ApplicationStatus.SUBMITTED,
    [ApplicationAction.RESUBMIT]: ApplicationStatus.SUBMITTED,
  },
  [ApplicationStatus.APPROVED]: {},
  [ApplicationStatus.REJECTED]: {},
};

/**
 * Pure function: Checks whether an action can be performed given the current status.
 * Single source of truth for application lifecycle gating across services and workers.
 *
 * @param currentStatus The application's current lifecycle status
 * @param action The requested domain action
 * @returns boolean indicating if the transition is valid
 */
export function canTransition(
  currentStatus: ApplicationStatus,
  action: ApplicationAction,
): boolean {
  const allowedActions = TRANSITION_MAP[currentStatus];
  if (!allowedActions) {
    return false;
  }
  return allowedActions[action] !== undefined;
}

/**
 * Pure function: Calculates the next status for a valid action, or throws an error.
 *
 * @param currentStatus The application's current lifecycle status
 * @param action The requested domain action
 * @throws Error if the transition is disallowed
 * @returns The resulting ApplicationStatus
 */
export function getNextStatus(
  currentStatus: ApplicationStatus,
  action: ApplicationAction,
): ApplicationStatus {
  const targetStatus = TRANSITION_MAP[currentStatus]?.[action];
  if (!targetStatus) {
    throw new Error(
      `Invalid state transition: Cannot perform action '${action}' on application with status '${currentStatus}'`,
    );
  }
  return targetStatus;
}

/**
 * Pure function: Determines if an application is editable.
 * Applications can only be modified in DRAFT or INFO_REQUESTED states.
 * Once SUBMITTED, APPROVED, or REJECTED, all fields are locked.
 *
 * @param status Current application status
 * @returns boolean indicating if application fields may be edited
 */
export function isEditable(status: ApplicationStatus): boolean {
  return (
    status === ApplicationStatus.DRAFT ||
    status === ApplicationStatus.INFO_REQUESTED
  );
}

/**
 * Pure function: Determines if an application is in an immutable terminal state.
 * APPROVED and REJECTED states are final and cannot be modified or re-submitted.
 *
 * @param status Current application status
 * @returns boolean indicating if application has reached a terminal state
 */
export function isTerminal(status: ApplicationStatus): boolean {
  return (
    status === ApplicationStatus.APPROVED ||
    status === ApplicationStatus.REJECTED
  );
}
