import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hash', () => {
    it('should hash a password with bcrypt cost factor 10', async () => {
      const plaintext = 'SuperSecret123!';
      const hash = await service.hash(plaintext);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      // Bcrypt hash with cost 10 starts with $2b$10$ or $2a$10$
      expect(hash).toMatch(/^\$2[ab]\$10\$/);
    });

    it('should generate unique salts and distinct hashes for identical passwords', async () => {
      const plaintext = 'Password123!';
      const hash1 = await service.hash(plaintext);
      const hash2 = await service.hash(plaintext);

      expect(hash1).not.toBe(hash2);
    });

    it('should throw an error if password is empty', async () => {
      await expect(service.hash('')).rejects.toThrow('Password must not be empty');
    });
  });

  describe('compare', () => {
    it('should return true for matching password and hash', async () => {
      const plaintext = 'CorrectPassword123!';
      const hash = await service.hash(plaintext);

      const isMatch = await service.compare(plaintext, hash);
      expect(isMatch).toBe(true);
    });

    it('should return false for mismatched password', async () => {
      const plaintext = 'CorrectPassword123!';
      const hash = await service.hash(plaintext);

      const isMatch = await service.compare('WrongPassword456!', hash);
      expect(isMatch).toBe(false);
    });

    it('should return false if password or hash is empty or falsy', async () => {
      expect(await service.compare('', 'some_hash')).toBe(false);
      expect(await service.compare('password', '')).toBe(false);
      expect(await service.compare('', '')).toBe(false);
    });
  });
});
