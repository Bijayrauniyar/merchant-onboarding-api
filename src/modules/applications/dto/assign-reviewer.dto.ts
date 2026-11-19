import { IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Request payload for assigning a merchant application to a designated reviewer.
 * Can only be executed by ADMIN users on applications in SUBMITTED status.
 */
export class AssignReviewerDto {
  /**
   * Unique identifier of the target user who holds the REVIEWER role.
   * @example "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
   */
  @IsUUID('4', { message: 'reviewerId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'reviewerId is required' })
  reviewerId!: string;
}
