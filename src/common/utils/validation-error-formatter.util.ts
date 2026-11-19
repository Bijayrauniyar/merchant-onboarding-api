import { ValidationError } from 'class-validator';

export interface FormattedValidationResult {
  messages: string[];
  errors: Record<string, string[]>;
}

/**
 * Formats class-validator ValidationError objects into clean, deduplicated,
 * and structured error responses suitable for both frontend form binding and human readability.
 */
export function formatValidationErrors(
  validationErrors: ValidationError[],
): FormattedValidationResult {
  const errors: Record<string, string[]> = {};
  const messages: string[] = [];

  function processErrors(errorList: ValidationError[], parentPath = ''): void {
    for (const err of errorList) {
      const propertyPath = parentPath
        ? `${parentPath}.${err.property}`
        : err.property;

      if (err.constraints) {
        let fieldMessages: string[];

        // If the field is missing or empty, prioritize the "is required" / "is defined" constraint
        // to avoid noisy cascading errors (e.g. minLength, maxLength, isString on empty/undefined values)
        if (err.constraints.isNotEmpty) {
          fieldMessages = [err.constraints.isNotEmpty];
        } else if (err.constraints.isDefined) {
          fieldMessages = [err.constraints.isDefined];
        } else {
          fieldMessages = Object.values(err.constraints);
        }

        errors[propertyPath] = fieldMessages;
        messages.push(...fieldMessages);
      }

      if (err.children && err.children.length > 0) {
        processErrors(err.children, propertyPath);
      }
    }
  }

  processErrors(validationErrors);

  return {
    messages,
    errors,
  };
}
