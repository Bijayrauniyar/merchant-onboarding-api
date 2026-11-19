import { PartialType } from '@nestjs/swagger';
import { CreateApplicationDto } from './create-application.dto';

/**
 * Request payload for updating an existing merchant onboarding application.
 * Applications may only be updated when in DRAFT or INFO_REQUESTED status.
 */
export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {}
