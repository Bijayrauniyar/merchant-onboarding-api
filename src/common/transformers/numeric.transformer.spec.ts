import { numericColumnTransformer } from './numeric.transformer';

describe('numericColumnTransformer', () => {
  describe('from (DB string -> JavaScript number)', () => {
    it('should transform numeric string from database into JavaScript number', () => {
      expect(numericColumnTransformer.from('85.50')).toBe(85.5);
      expect(numericColumnTransformer.from('50000.50')).toBe(50000.5);
      expect(numericColumnTransformer.from('120.00')).toBe(120);
      expect(numericColumnTransformer.from('0')).toBe(0);
    });

    it('should pass through null when hydrating from database', () => {
      expect(numericColumnTransformer.from(null)).toBeNull();
    });

    it('should pass through undefined when hydrating from database', () => {
      expect(numericColumnTransformer.from(undefined)).toBeUndefined();
    });
  });

  describe('to (JavaScript number -> DB representation)', () => {
    it('should pass through valid numbers during serialization', () => {
      expect(numericColumnTransformer.to(50000.5)).toBe(50000.5);
      expect(numericColumnTransformer.to(85.5)).toBe(85.5);
      expect(numericColumnTransformer.to(0)).toBe(0);
    });

    it('should preserve undefined so partial updates do not overwrite columns', () => {
      expect(numericColumnTransformer.to(undefined)).toBeUndefined();
    });

    it('should preserve null when explicitly setting column to null', () => {
      expect(numericColumnTransformer.to(null)).toBeNull();
    });
  });
});
