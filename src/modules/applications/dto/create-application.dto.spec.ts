import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateApplicationDto } from './create-application.dto';
import { BusinessType } from '../enums/business-type.enum';

describe('CreateApplicationDto Validation', () => {
  const validPayload = {
    businessName: 'Acme Coffee Roasters',
    legalBusinessName: 'Acme Coffee Roasters LLC',
    businessType: BusinessType.LLC,
    ownerName: 'Jane Doe',
    ownerEmail: 'jane@acmepayments.com',
    ownerPhone: '+14155552671',
    requestedMonthlyVolume: 50000.0,
    requestedAvgTicket: 125.5,
  };

  it('should pass validation with a complete and valid payload', async () => {
    const dto = plainToInstance(CreateApplicationDto, validPayload);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should normalize and lowercase/trim ownerEmail via class-transformer', () => {
    const dto = plainToInstance(CreateApplicationDto, {
      ...validPayload,
      ownerEmail: '  Jane.Doe@ACMEpayments.COM  ',
    });
    expect(dto.ownerEmail).toBe('jane.doe@acmepayments.com');
  });

  it('should fail validation when ownerEmail is not a valid email', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      ...validPayload,
      ownerEmail: 'invalid-email-string',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('ownerEmail');
  });

  it('should fail validation when businessType is not a valid enum member', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      ...validPayload,
      businessType: 'INVALID_CORP' as any,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('businessType');
  });

  it('should fail validation when requestedMonthlyVolume is negative or zero', async () => {
    const dtoZero = plainToInstance(CreateApplicationDto, {
      ...validPayload,
      requestedMonthlyVolume: 0,
    });
    const errorsZero = await validate(dtoZero);
    expect(errorsZero.length).toBeGreaterThan(0);

    const dtoNegative = plainToInstance(CreateApplicationDto, {
      ...validPayload,
      requestedMonthlyVolume: -500,
    });
    const errorsNegative = await validate(dtoNegative);
    expect(errorsNegative.length).toBeGreaterThan(0);
  });

  it('should fail validation when requestedAvgTicket is negative or zero', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      ...validPayload,
      requestedAvgTicket: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation when required strings are empty', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      ...validPayload,
      businessName: '',
      ownerName: '',
    });
    const errors = await validate(dto);
    const errorProps = errors.map((e) => e.property);
    expect(errorProps).toContain('businessName');
    expect(errorProps).toContain('ownerName');
  });
});
