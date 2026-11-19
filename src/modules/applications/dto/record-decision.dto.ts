import {
  IsEnum,
  IsNotEmpty,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ReviewerDecision } from '../enums/reviewer-decision.enum';

/**
 * Custom validator ensuring contextual, situation-specific validation for decision notes:
 * - Optional when decision is APPROVE (if omitted, passes cleanly).
 * - Mandatory when decision is REJECT or REQUEST_INFO (min 5 chars, max 2000 chars).
 * - Emits exactly ONE situation-specific error message at a time.
 */
@ValidatorConstraint({ name: 'decisionNote', async: false })
export class DecisionNoteValidator implements ValidatorConstraintInterface {
  private failureReason = 'note is invalid';

  validate(note: unknown, args: ValidationArguments): boolean {
    const obj = args.object as RecordDecisionDto;
    const isApprove = obj?.decision === ReviewerDecision.APPROVE;

    // Optional for APPROVE if omitted or empty
    if (isApprove && (note === undefined || note === null || note === '')) {
      return true;
    }

    // Mandatory for REJECT and REQUEST_INFO if omitted or empty
    if (
      !isApprove &&
      (note === undefined ||
        note === null ||
        (typeof note === 'string' && note.trim().length === 0))
    ) {
      this.failureReason =
        'note is mandatory when rejecting or requesting information';
      return false;
    }

    // Must be a string if provided
    if (typeof note !== 'string') {
      this.failureReason = 'note must be a string';
      return false;
    }

    const trimmed = note.trim();
    if (trimmed.length < 5) {
      this.failureReason = 'note must be at least 5 characters long';
      return false;
    }

    if (note.length > 2000) {
      this.failureReason = 'note must not exceed 2000 characters';
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return this.failureReason;
  }
}

/**
 * Request payload for a reviewer recording a decision on a submitted merchant application.
 * Note is optional for APPROVE, but mandatory (min 5 characters) for REJECT and REQUEST_INFO.
 */
export class RecordDecisionDto {
  /**
   * Official determination recorded by the assigned reviewer.
   * @example "APPROVE"
   */
  @IsEnum(ReviewerDecision, {
    message: `decision must be one of: ${Object.values(ReviewerDecision).join(', ')}`,
  })
  @IsNotEmpty({ message: 'decision is required' })
  decision!: ReviewerDecision;

  /**
   * Explanation or rationale for the review decision.
   * Optional for APPROVE; mandatory (minimum 5 characters) for REJECT and REQUEST_INFO.
   * @example "Merchant documentation satisfies all AML/KYB verification requirements."
   */
  @Validate(DecisionNoteValidator)
  note?: string;
}
