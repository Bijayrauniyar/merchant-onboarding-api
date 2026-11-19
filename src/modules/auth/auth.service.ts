import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/entities/user.entity';
import { PasswordService } from './password.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Service managing user authentication and JWT credential issuance.
 *
 * Core Security & Invariants:
 * 1. Anti-Enumeration: Returns identical 401 Unauthorized ('Invalid email or password')
 *    whether the user record is missing or the password hash comparison fails.
 * 2. Hash Isolation: Leverages entity `select: false` so password hashes are never
 *    queried in standard ORM operations, explicitly requesting it here only for verification.
 * 3. Index Utilization: Queries with normalized lowercase equality (`user.email = :email`)
 *    allowing PostgreSQL to perform an instant O(log N) index scan on `IDX_users_email`.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authenticates user credentials and returns a signed stateless JWT Bearer token.
   *
   * @param loginDto Validated and sanitized login payload (email and password).
   * @returns JWT access token, expiration window, and safe user profile.
   * @throws UnauthorizedException on invalid credentials or non-existent account.
   */
  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const normalizedEmail = loginDto.email.toLowerCase().trim();

    // Query user and explicitly select passwordHash (which is select: false by default)
    // Direct equality allows PostgreSQL to utilize the unique B-Tree index on email
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizedEmail })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.passwordService.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Compose minimal stateless token claims for Tier 1 route guards and Tier 2 SQL scoping
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const expiresIn = this.configService.get<string>('jwt.expiresIn') || '24h';

    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
}
