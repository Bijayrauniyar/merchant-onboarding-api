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

    it('should mask sensitive update diff objects with no raw email or phone in JSON.stringify output', () => {
      const input = {
        ownerEmail: { from: 'old@shop.com', to: 'new@shop.com' },
        ownerPhone: { from: '+14155550199', to: '+14155550200' },
      };

      const result = maskSensitiveData(input);
      const jsonOutput = JSON.stringify(result);

      // Expect no raw email or phone anywhere in JSON.stringify of the output
      expect(jsonOutput).not.toContain('old@shop.com');
      expect(jsonOutput).not.toContain('new@shop.com');
      expect(jsonOutput).not.toContain('+14155550199');
      expect(jsonOutput).not.toContain('+14155550200');

      // Verify properly masked values and preserved structure
      expect(result.ownerEmail.from).toBe('o***d@shop.com');
      expect(result.ownerEmail.to).toBe('n***w@shop.com');
      expect(result.ownerPhone.from).toBe('***-***-0199');
      expect(result.ownerPhone.to).toBe('***-***-0200');
    });

    it('should mask a nested object three levels deep under a sensitive key', () => {
      const input = {
        ownerEmail: {
          level1: {
            level2: {
              address: 'deep@shop.com',
            },
          },
        },
        ownerPhone: {
          direct: {
            support: {
              number: '+14155550199',
            },
          },
        },
        secretKey: {
          auth: {
            vault: {
              token: 'my_deep_secret_token',
            },
          },
        },
      };

      const result = maskSensitiveData(input);

      expect(result.ownerEmail.level1.level2.address).toBe('d***p@shop.com');
      expect(result.ownerPhone.direct.support.number).toBe('***-***-0199');
      expect(result.secretKey.auth.vault.token).toBe('[REDACTED]');
    });

    it('should mask an array of strings under a sensitive key', () => {
      const input = {
        ownerEmail: ['primary@shop.com', 'backup@shop.com'],
        ownerPhone: ['+14155550199', '+14155550200'],
        apiKeys: ['key_live_123', 'key_live_456'],
      };

      const result = maskSensitiveData(input);

      expect(result.ownerEmail).toEqual(['p***y@shop.com', 'b***p@shop.com']);
      expect(result.ownerPhone).toEqual(['***-***-0199', '***-***-0200']);
      expect(result.apiKeys).toEqual(['[REDACTED]', '[REDACTED]']);
    });

    it('should leave non-sensitive keys unchanged', () => {
      const input = {
        businessName: 'Apex Roasters Inc',
        legalBusinessName: 'Apex Roasters LLC',
        requestedMonthlyVolume: 50000,
        requestedAvgTicket: 25.5,
        status: 'DRAFT',
        tags: ['retail', 'coffee'],
        metadata: {
          notes: 'Standard onboarding flow',
          applicationCount: 1,
          isVerified: false,
        },
      };

      const result = maskSensitiveData(input);

      expect(result).toEqual(input);
    });

    it('should ensure null and undefined values do not throw at root or nested levels', () => {
      expect(() => maskSensitiveData(null)).not.toThrow();
      expect(maskSensitiveData(null)).toBeNull();

      expect(() => maskSensitiveData(undefined)).not.toThrow();
      expect(maskSensitiveData(undefined)).toBeUndefined();

      const inputWithNulls = {
        ownerEmail: null,
        ownerPhone: undefined,
        password: null,
        token: undefined,
        businessName: null,
        notes: undefined,
        nested: {
          email: null,
          phone: undefined,
          secret: null,
          regularField: undefined,
        },
        emailsList: [null, undefined, 'user@shop.com'],
        regularList: [null, undefined, 'regular-item'],
      };

      let result: any;
      expect(() => {
        result = maskSensitiveData(inputWithNulls);
      }).not.toThrow();

      expect(result.ownerEmail).toBeNull();
      expect(result.ownerPhone).toBeUndefined();
      expect(result.password).toBeNull();
      expect(result.token).toBeUndefined();
      expect(result.businessName).toBeNull();
      expect(result.notes).toBeUndefined();
      expect(result.nested.email).toBeNull();
      expect(result.nested.phone).toBeUndefined();
      expect(result.nested.secret).toBeNull();
      expect(result.nested.regularField).toBeUndefined();
      expect(result.emailsList).toEqual([null, undefined, 'u***r@shop.com']);
      expect(result.regularList).toEqual([null, undefined, 'regular-item']);
    });

    it('should mask email and phone fields in update diffs ({ from, to }) with mixed fields', () => {
      const input = {
        updatedFields: ['ownerEmail', 'ownerPhone', 'password'],
        changes: {
          ownerEmail: {
            from: 'old.email@example.com',
            to: 'new.email@example.com',
          },
          ownerPhone: {
            from: '+1-555-111-2222',
            to: '+1-555-333-4444',
          },
          password: {
            from: 'oldPassword123',
            to: 'newPassword456',
          },
          businessName: {
            from: 'Old Business',
            to: 'New Business',
          },
        },
      };

      const result = maskSensitiveData(input);

      expect(result.changes.ownerEmail.from).toBe('o***l@example.com');
      expect(result.changes.ownerEmail.to).toBe('n***l@example.com');
      expect(result.changes.ownerPhone.from).toBe('***-***-2222');
      expect(result.changes.ownerPhone.to).toBe('***-***-4444');
      expect(result.changes.password.from).toBe('[REDACTED]');
      expect(result.changes.password.to).toBe('[REDACTED]');
      expect(result.changes.businessName.from).toBe('Old Business');
      expect(result.changes.businessName.to).toBe('New Business');
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

    it('should handle primitives cleanly', () => {
      expect(maskSensitiveData('plain text')).toBe('plain text');
      expect(maskSensitiveData(12345)).toBe(12345);
      expect(maskSensitiveData(true)).toBe(true);
    });
  });
});
