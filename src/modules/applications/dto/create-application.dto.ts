import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BusinessType } from '../enums/business-type.enum';

/**
 * Request payload for creating a new merchant onboarding application.
 * Applications are initialized in DRAFT status with submissionVersion = 0.
 */
export class CreateApplicationDto {
  /**
   * Operating name of the business (DBA)
   * @example "Acme Coffee Roasters"
   */
  @IsString({ message: 'businessName must be a string' })
  @IsNotEmpty({ message: 'businessName is required' })
  @MinLength(2, { message: 'businessName must be at least 2 characters long' })
  @MaxLength(255, { message: 'businessName must not exceed 255 characters' })
  businessName!: string;

  /**
   * Registered legal business name
   * @example "Acme Coffee Roasters LLC"
   */
  @IsString({ message: 'legalBusinessName must be a string' })
  @IsNotEmpty({ message: 'legalBusinessName is required' })
  @MinLength(2, { message: 'legalBusinessName must be at least 2 characters long' })
  @MaxLength(255, { message: 'legalBusinessName must not exceed 255 characters' })
  legalBusinessName!: string;

  /**
   * Legal structure of the merchant entity
   * @example "LLC"
   */
  @IsEnum(BusinessType, {
    message: `businessType must be one of: ${Object.values(BusinessType).join(', ')}`,
  })
  @IsNotEmpty({ message: 'businessType is required' })
  businessType!: BusinessType;

  /**
   * Full legal name of the primary business owner / principal
   * @example "Jane Doe"
   */
  @IsString({ message: 'ownerName must be a string' })
  @IsNotEmpty({ message: 'ownerName is required' })
  @MinLength(2, { message: 'ownerName must be at least 2 characters long' })
  @MaxLength(255, { message: 'ownerName must not exceed 255 characters' })
  ownerName!: string;

  /**
   * Contact email address of the business owner
   * @example "jane@acmepayments.com"
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEmail({}, { message: 'ownerEmail must be a valid email address' })
  @IsNotEmpty({ message: 'ownerEmail is required' })
  @MaxLength(255, { message: 'ownerEmail must not exceed 255 characters' })
  ownerEmail!: string;

  /**
   * Contact phone number of the business owner
   * @example "+14155552671"
   */
  @IsString({ message: 'ownerPhone must be a string' })
  @IsNotEmpty({ message: 'ownerPhone is required' })
  @MaxLength(50, { message: 'ownerPhone must not exceed 50 characters' })
  ownerPhone!: string;

  /**
   * Estimated monthly payment processing volume (USD)
   * @example 50000.00
   */
  @IsNotEmpty({ message: 'requestedMonthlyVolume is required' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'requestedMonthlyVolume must be a valid number with up to 2 decimal places' },
  )
  @IsPositive({ message: 'requestedMonthlyVolume must be positive' })
  @Min(1, { message: 'requestedMonthlyVolume must be at least 1' })
  requestedMonthlyVolume!: number;

  /**
   * Estimated average transaction ticket size (USD)
   * @example 125.50
   */
  @IsNotEmpty({ message: 'requestedAvgTicket is required' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'requestedAvgTicket must be a valid number with up to 2 decimal places' },
  )
  @IsPositive({ message: 'requestedAvgTicket must be positive' })
  @Min(1, { message: 'requestedAvgTicket must be at least 1' })
  requestedAvgTicket!: number;
}
