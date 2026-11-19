import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RecordDecisionDto } from './record-decision.dto';
import { ReviewerDecision } from '../enums/reviewer-decision.enum';

describe('RecordDecisionDto', () => {
  it('should pass validation for APPROVE decision without a note', async () => {
    const payload = {
      decision: ReviewerDecision.APPROVE,
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('should pass validation for APPROVE decision with a valid optional note', async () => {
    const payload = {
      decision: ReviewerDecision.APPROVE,
      note: 'All KYB and beneficial ownership checks verified cleanly.',
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('should fail validation for APPROVE decision when note is shorter than 5 characters', async () => {
    const payload = {
      decision: ReviewerDecision.APPROVE,
      note: 'Ok',
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints || {});
    expect(messages).toContain('note must be at least 5 characters long');
  });

  it('should fail validation for REJECT decision when note is omitted', async () => {
    const payload = {
      decision: ReviewerDecision.REJECT,
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints || {});
    expect(messages).toContain(
      'note is mandatory when rejecting or requesting information',
    );
  });

  it('should fail validation for REJECT decision when note is shorter than 5 characters', async () => {
    const payload = {
      decision: ReviewerDecision.REJECT,
      note: 'No',
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints || {});
    expect(messages).toContain('note must be at least 5 characters long');
  });

  it('should pass validation for REJECT decision with a valid explanation note', async () => {
    const payload = {
      decision: ReviewerDecision.REJECT,
      note: 'Prohibited high-risk industry (online gambling operator).',
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('should fail validation for REQUEST_INFO decision when note is omitted', async () => {
    const payload = {
      decision: ReviewerDecision.REQUEST_INFO,
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints || {});
    expect(messages).toContain(
      'note is mandatory when rejecting or requesting information',
    );
  });

  it('should pass validation for REQUEST_INFO decision with actionable guidance note', async () => {
    const payload = {
      decision: ReviewerDecision.REQUEST_INFO,
      note: 'Please provide corporate articles of incorporation and voided check.',
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('should fail validation when decision is an invalid enum value', async () => {
    const payload = {
      decision: 'MAYBE',
      note: 'Undecided',
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints || {});
    expect(messages).toContain(
      'decision must be one of: APPROVE, REJECT, REQUEST_INFO',
    );
  });

  it('should fail validation when decision is missing', async () => {
    const payload = {
      note: 'Missing decision field',
    };

    const dto = plainToInstance(RecordDecisionDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints || {});
    expect(messages).toContain('decision is required');
  });
});
