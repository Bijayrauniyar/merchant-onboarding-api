/**
 * Allowable determinations a human reviewer can record on a submitted merchant application.
 */
export enum ReviewerDecision {
  /**
   * Approves the application and moves it to the terminal APPROVED status.
   */
  APPROVE = 'APPROVE',

  /**
   * Declines the application and moves it to the terminal REJECTED status.
   * Requires a mandatory explanation note.
   */
  REJECT = 'REJECT',

  /**
   * Requests additional clarification or documentation from the sales agent.
   * Transitions status to INFO_REQUESTED, re-opening the application for edits.
   * Requires a mandatory explanation note.
   */
  REQUEST_INFO = 'REQUEST_INFO',
}
