/**
 * Domain actions that trigger lifecycle transitions on a merchant application.
 */
export enum ApplicationAction {
  SUBMIT = 'SUBMIT',
  RESUBMIT = 'RESUBMIT',
  ASSIGN = 'ASSIGN',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_INFO = 'REQUEST_INFO',
}
