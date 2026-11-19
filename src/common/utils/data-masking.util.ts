/**
 * Sensitive Data Masking & Redaction Utility
 *
 * Recursively sanitizes objects, arrays, and primitive data to prevent PII
 * (Personally Identifiable Information) and secrets from leaking into audit logs
 * or application monitoring systems.
 */

const SECRET_KEY_REGEX =
  /password|token|secret|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|pin/i;
const EMAIL_KEY_REGEX = /email/i;
const PHONE_KEY_REGEX = /phone|mobile|telephone/i;

export type SensitiveRule = 'secret' | 'email' | 'phone';

/**
 * Masks an email address into format: j***e@domain.com
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return email;
  }

  const [username, domain] = email.split('@');
  if (!username || !domain) {
    return email;
  }

  if (username.length <= 2) {
    return `${username[0]}*@${domain}`;
  }

  const firstChar = username[0];
  const lastChar = username[username.length - 1];
  return `${firstChar}***${lastChar}@${domain}`;
}

/**
 * Masks a phone number to show only the last 4 digits: ***-***-1234
 */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return phone;
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) {
    return '***';
  }

  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

/**
 * Determines the sensitivity rule matched by a given property key.
 */
function getSensitivityRule(key: string): SensitiveRule | null {
  if (SECRET_KEY_REGEX.test(key)) {
    return 'secret';
  }
  if (EMAIL_KEY_REGEX.test(key)) {
    return 'email';
  }
  if (PHONE_KEY_REGEX.test(key)) {
    return 'phone';
  }
  return null;
}

/**
 * Masks a string value according to the specified sensitivity rule.
 */
function maskValueByRule(val: string, rule: SensitiveRule): string {
  switch (rule) {
    case 'secret':
      return '[REDACTED]';
    case 'email':
      return maskEmail(val);
    case 'phone':
      return maskPhone(val);
  }
}

/**
 * Recursively cleanses an object, array, or primitive value.
 * Returns a new deep clone without mutating the original input.
 *
 * When a key matches a sensitive pattern, every string value beneath it,
 * at any depth and inside arrays, is masked using that key's rule:
 * - email keys use the existing email mask (e.g. j***e@domain.com)
 * - phone keys use the existing phone mask (e.g. ***-***-1234)
 * - password/token/secret/authorization keys become '[REDACTED]'
 *
 * Sensitivity is carried down through recursion via `inheritedRule`.
 * Non-sensitive keys recurse normally without altering shapes.
 */
export function maskSensitiveData<T = any>(
  data: T,
  inheritedRule?: SensitiveRule,
): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Primitive types
  if (typeof data !== 'object') {
    if (typeof data === 'string' && inheritedRule) {
      return maskValueByRule(data, inheritedRule) as unknown as T;
    }
    return data;
  }

  // Arrays
  if (Array.isArray(data)) {
    return data.map((item) =>
      maskSensitiveData(item, inheritedRule),
    ) as unknown as T;
  }

  // Dates
  if (data instanceof Date) {
    return new Date(data.getTime()) as unknown as T;
  }

  // Standard Objects
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const keyRule = getSensitivityRule(key);
    // If the key has its own sensitive pattern, that takes precedence;
    // otherwise inherit sensitivity from the parent context.
    const activeRule = keyRule ?? inheritedRule;

    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    if (typeof value === 'object') {
      result[key] = maskSensitiveData(value, activeRule);
      continue;
    }

    if (typeof value === 'string' && activeRule) {
      result[key] = maskValueByRule(value, activeRule);
      continue;
    }

    if (keyRule === 'secret') {
      result[key] = '[REDACTED]';
      continue;
    }

    result[key] = value;
  }

  return result as T;
}
