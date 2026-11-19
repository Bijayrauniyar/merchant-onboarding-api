import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserRole } from '../../users/enums/user-role.enum';

/**
 * Passport strategy intercepting HTTP requests containing `Authorization: Bearer <token>`.
 *
 * Responsibilities:
 * 1. Cryptographically verifies the HMAC SHA-256 JWT signature and expiration against JWT_SECRET.
 * 2. Unpacks claims from the token payload and validates presence of `sub`, `email`, and `role`.
 * 3. Injects `{ id, email, role }` onto `req.user`, providing caller identity for RolesGuard
 *    and downstream SQL ownership queries (Tier 2 scoping).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Called automatically by Passport once the token signature and expiration are verified.
   */
  async validate(payload: JwtPayload): Promise<{ id: string; email: string; role: UserRole }> {
    if (!payload.sub || !payload.email || !payload.role) {
      throw new UnauthorizedException('Malformed token payload');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
