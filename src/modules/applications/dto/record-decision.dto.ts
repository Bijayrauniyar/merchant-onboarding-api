import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ReviewerDecision } from '../enums/reviewer-decision.enum';

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
  @ValidateIf(
    (o: RecordDecisionDto) =>
      o.decision !== ReviewerDecision.APPROVE || o.note !== undefined,
  )
  @IsNotEmpty({
    message: 'note is mandatory when rejecting or requesting information',
  })
  @IsString({ message: 'note must be a string' })
  @MinLength(5, {
    message: 'note must be at least 5 characters long',
  })
  @MaxLength(2000, {
    message: 'note must not exceed 2000 characters',
  })
  note?: string;
}
