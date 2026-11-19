import { ValidationError } from 'class-validator';
import { formatValidationErrors } from './validation-error-formatter.util';

describe('formatValidationErrors', () => {
  it('should collapse cascading constraints to "is required" when isNotEmpty constraint exists', () => {
    const mockErrors: ValidationError[] = [
      {
        property: 'legalBusinessName',
        constraints: {
          maxLength: 'legalBusinessName must not exceed 255 characters',
          minLength: 'legalBusinessName must be at least 2 characters long',
          isNotEmpty: 'legalBusinessName is required',
          isString: 'legalBusinessName must be a string',
        },
      },
    ];

    const result = formatValidationErrors(mockErrors);

    expect(result.messages).toEqual(['legalBusinessName is required']);
    expect(result.errors).toEqual({
      legalBusinessName: ['legalBusinessName is required'],
    });
  });

  it('should preserve all constraints when field is provided but violates multiple business rules', () => {
    const mockErrors: ValidationError[] = [
      {
        property: 'requestedMonthlyVolume',
        value: -500,
        constraints: {
          min: 'requestedMonthlyVolume must be at least 1',
          isPositive: 'requestedMonthlyVolume must be positive',
        },
      },
    ];

    const result = formatValidationErrors(mockErrors);

    expect(result.messages).toEqual([
      'requestedMonthlyVolume must be at least 1',
      'requestedMonthlyVolume must be positive',
    ]);
    expect(result.errors.requestedMonthlyVolume).toEqual([
      'requestedMonthlyVolume must be at least 1',
      'requestedMonthlyVolume must be positive',
    ]);
  });

  it('should format unwhitelisted property rejections', () => {
    const mockErrors: ValidationError[] = [
      {
        property: 'status',
        constraints: {
          whitelistValidation: 'property status should not exist',
        },
      },
    ];

    const result = formatValidationErrors(mockErrors);

    expect(result.messages).toEqual(['property status should not exist']);
    expect(result.errors.status).toEqual(['property status should not exist']);
  });

  it('should handle nested validation errors recursively', () => {
    const mockErrors: ValidationError[] = [
      {
        property: 'address',
        children: [
          {
            property: 'zipCode',
            constraints: {
              isNotEmpty: 'zipCode is required',
              isString: 'zipCode must be a string',
            },
          },
        ],
      },
    ];

    const result = formatValidationErrors(mockErrors);

    expect(result.messages).toEqual(['zipCode is required']);
    expect(result.errors['address.zipCode']).toEqual(['zipCode is required']);
  });

  it('should return empty result when validation error array is empty', () => {
    const result = formatValidationErrors([]);
    expect(result.messages).toEqual([]);
    expect(result.errors).toEqual({});
  });
});
