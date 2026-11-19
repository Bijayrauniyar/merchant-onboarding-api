import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QueryApplicationsDto } from './query-applications.dto';
import { ApplicationStatus } from '../enums/application-status.enum';

describe('QueryApplicationsDto Validation', () => {
  it('should apply default values for page (1) and limit (20)', () => {
    const dto = plainToInstance(QueryApplicationsDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('should transform string query parameters into numbers and pass validation', async () => {
    const dto = plainToInstance(QueryApplicationsDto, {
      page: '2',
      limit: '50',
      status: ApplicationStatus.SUBMITTED,
    });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(dto.status).toBe(ApplicationStatus.SUBMITTED);

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when page is less than 1', async () => {
    const dto = plainToInstance(QueryApplicationsDto, { page: '0' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('page');
  });

  it('should fail validation when limit exceeds 100', async () => {
    const dto = plainToInstance(QueryApplicationsDto, { limit: '150' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('limit');
  });

  it('should fail validation when status is not a valid ApplicationStatus', async () => {
    const dto = plainToInstance(QueryApplicationsDto, {
      status: 'INVALID_STATUS' as any,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('status');
  });
});
