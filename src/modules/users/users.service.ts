import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { UserResponseDto } from './dto/user-response.dto';

/**
 * Service managing user directory queries.
 *
 * Security Invariants:
 * - Credentials Isolation: Excludes `passwordHash` from query results and API response DTOs.
 * - Deterministic Ordering: Enforces alphabetical ordering by `email` ASC for predictable listings.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Retrieves all users, optionally filtered by system role.
   *
   * @param role Optional UserRole filter (e.g. REVIEWER)
   * @returns List of safe user profiles stripped of sensitive credentials.
   */
  async findAll(role?: UserRole): Promise<UserResponseDto[]> {
    const where = role ? { role } : {};
    const users = await this.userRepository.find({
      where,
      order: { email: 'ASC' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }));
  }
}
