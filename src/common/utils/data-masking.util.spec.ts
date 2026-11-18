import { maskEmail, maskPhone, maskSensitiveData } from './data-masking.util';

describe('DataMaskingUtil', () => {
  describe('maskEmail', () => {
    it('should mask standard email addresses', () => {
      expect(maskEmail('john.doe@example.com')).toBe('j***e@example.com');
      expect(maskEmail('support@company.org')).toBe('s***t@company.org');
    });

    it('should handle short username emails', () => {
      expect(maskEmail('ab@example.com')).toBe('a*@example.com');
      expect(maskEmail('a@example.com')).toBe('a*@example.com');
    });

    it('should return original if string is not a valid email', () => {
      expect(maskEmail('')).toBe('');
      expect(maskEmail('not-an-email')).toBe('not-an-email');
      expect(maskEmail(null as any)).toBeNull();
    });
  });

  describe('maskPhone', () => {
    it('should mask phone numbers showing only the last 4 digits', () => {
      expect(maskPhone('+1-555-123-4567')).toBe('***-***-4567');
      expect(maskPhone('(555) 019-2834')).toBe('***-***-2834');
      expect(maskPhone('1234567890')).toBe('***-***-7890');
    });

    it('should handle short or invalid phone numbers', () => {
      expect(maskPhone('123')).toBe('***');
      expect(maskPhone('')).toBe('');
      expect(maskPhone(undefined as any)).toBeUndefined();
    });
  });

  describe('maskSensitiveData', () => {
    it('should completely redact secrets, passwords and tokens', () => {
      const input = {
        username: 'alice',
        password: 'SuperSecretPassword123!',
        jwtToken: 'eyJhbGciOiJIUzI1NiIsIn...',
        api_key: 'key_live_987654321',
        accessToken: 'access_12345',
        refreshToken: 'refresh_67890',
        privateKey: '-----BEGIN PRIVATE KEY-----',
      };

      const result = maskSensitiveData(input);

      expect(result.username).toBe('alice');
      expect(result.password).toBe('[REDACTED]');
      expect(result.jwtToken).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.privateKey).toBe('[REDACTED]');
    });

    it('should mask email and phone fields', () => {
      const input = {
        businessName: 'Acme Coffee LLC',
        ownerEmail: 'alice@acmepayments.com',
        ownerPhone: '+1-555-444-3322',
      };

      const result = maskSensitiveData(input);

      expect(result.businessName).toBe('Acme Coffee LLC');
      expect(result.ownerEmail).toBe('a***e@acmepayments.com');
      expect(result.ownerPhone).toBe('***-***-3322');
    });

    it('should recursively cleanse deeply nested objects and arrays', () => {
      const input = {
        merchant: {
          name: 'Global Traders',
          contacts: [
            {
              role: 'CEO',
              email: 'ceo@globaltraders.com',
              phone: '123-456-7890',
              secretPin: '1234',
            },
            {
              role: 'CFO',
              email: 'cfo@globaltraders.com',
              phone: '098-765-4321',
              password: 'cfo-password',
            },
          ],
        },
        meta: {
          session: {
            token: 'session_token_xyz',
            valid: true,
          },
        },
      };

      const result = maskSensitiveData(input);

      expect(result.merchant.name).toBe('Global Traders');
      expect(result.merchant.contacts[0].email).toBe('c***o@globaltraders.com');
      expect(result.merchant.contacts[0].phone).toBe('***-***-7890');
      expect(result.merchant.contacts[0].secretPin).toBe('[REDACTED]');
      expect(result.merchant.contacts[1].email).toBe('c***o@globaltraders.com');
      expect(result.merchant.contacts[1].password).toBe('[REDACTED]');
      expect(result.meta.session.token).toBe('[REDACTED]');
      expect(result.meta.session.valid).toBe(true);
    });

    it('should not mutate the original input object (immutability)', () => {
      const original = {
        ownerEmail: 'test@example.com',
        password: 'mypassword',
      };

      const originalCopy = JSON.parse(JSON.stringify(original));
      maskSensitiveData(original);

      expect(original).toEqual(originalCopy);
    });

    it('should handle primitives, null and undefined cleanly', () => {
      expect(maskSensitiveData(null)).toBeNull();
      expect(maskSensitiveData(undefined)).toBeUndefined();
      expect(maskSensitiveData('plain text')).toBe('plain text');
      expect(maskSensitiveData(12345)).toBe(12345);
      expect(maskSensitiveData(true)).toBe(true);
    });
  });
});
