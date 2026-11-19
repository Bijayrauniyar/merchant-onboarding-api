import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AssignReviewerDto } from './assign-reviewer.dto';

describe('AssignReviewerDto', () => {
  it('should pass validation with a valid UUID v4 reviewerId', async () => {
    const payload = {
      reviewerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    };

    const dto = plainToInstance(AssignReviewerDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBe(0);
  });

  it('should fail validation when reviewerId is not a valid UUID', async () => {
    const payload = {
      reviewerId: 'not-a-valid-uuid',
    };

    const dto = plainToInstance(AssignReviewerDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints || {});
    expect(messages).toContain('reviewerId must be a valid UUID v4');
  });

  it('should fail validation when reviewerId is missing or empty', async () => {
    const payload = {};

    const dto = plainToInstance(AssignReviewerDto, payload);
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints || {});
    expect(messages).toContain('reviewerId is required');
  });
});
