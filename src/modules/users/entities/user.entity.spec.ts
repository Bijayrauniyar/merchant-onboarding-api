import { User } from './user.entity';
import { UserRole } from '../enums/user-role.enum';

describe('User Entity & UserRole Enum', () => {
  it('should define the three required domain roles', () => {
    expect(UserRole.ADMIN).toBe('ADMIN');
    expect(UserRole.REVIEWER).toBe('REVIEWER');
    expect(UserRole.SALES).toBe('SALES');
  });

  it('should instantiate a User entity with expected properties', () => {
    const user = new User();
    user.id = '123e4567-e89b-12d3-a456-426614174000';
    user.email = 'sales1@example.com';
    user.passwordHash = 'hashed_secret';
    user.role = UserRole.SALES;
    user.createdAt = new Date();
    user.updatedAt = new Date();

    expect(user.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(user.email).toBe('sales1@example.com');
    expect(user.passwordHash).toBe('hashed_secret');
    expect(user.role).toBe(UserRole.SALES);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });
});
