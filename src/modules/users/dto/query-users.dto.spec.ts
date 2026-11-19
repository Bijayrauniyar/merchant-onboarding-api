import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QueryUsersDto } from './query-users.dto';
import { UserRole } from '../enums/user-role.enum';

describe('QueryUsersDto Validation', () => {
  it('should pass validation when no role filter is provided', async () => {
    const dto = plainToInstance(QueryUsersDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.role).toBeUndefined();
  });

  it('should pass validation when a valid role is provided', async () => {
    const dto = plainToInstance(QueryUsersDto, { role: UserRole.REVIEWER });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.role).toBe(UserRole.REVIEWER);
  });

  it('should pass validation for all defined UserRole values', async () => {
    for (const role of Object.values(UserRole)) {
      const dto = plainToInstance(QueryUsersDto, { role });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.role).toBe(role);
    }
  });

  it('should fail validation when an invalid role is provided', async () => {
    const dto = plainToInstance(QueryUsersDto, { role: 'SUPERUSER' as any });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('role');
    expect(errors[0].constraints?.isEnum).toContain('role must be one of:');
  });
});
