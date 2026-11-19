import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * Service encapsulating cryptographic password hashing and verification.
 *
 * Security Design:
 * - Cost Factor: Fixed at 10 rounds (2^10 = 1,024 iterations), balancing strong defense
 *   against brute-force/GPU cracking (~70ms execution) with negligible login latency.
 * - Constant-Time Verification: bcrypt.compare extracts salt/rounds from the hash and
 *   compares candidate digest in constant time to thwart side-channel timing attacks.
 */
@Injectable()
export class PasswordService {
  private readonly SALT_ROUNDS = 10;

  /**
   * Hashes a plaintext password with a cryptographically secure random salt.
   * Throws if the input password is empty.
   */
  async hash(password: string): Promise<string> {
    if (!password) {
      throw new Error('Password must not be empty');
    }
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Compares a candidate plaintext password against a stored bcrypt hash in constant time.
   * Fails closed (returns false) if either argument is falsy without throwing runtime errors.
   */
  async compare(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }
    return bcrypt.compare(password, hash);
  }
}
