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
 * Recursively cleanses an object, array, or primitive value.
 * Returns a new deep clone without mutating the original input.
 */
export function maskSensitiveData<T = any>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Primitive types
  if (typeof data !== 'object') {
    return data;
  }

  // Arrays
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item)) as unknown as T;
  }

  // Dates
  if (data instanceof Date) {
    return new Date(data.getTime()) as unknown as T;
  }

  // Standard Objects
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    // 1. Secrets and credentials: completely redact
    if (SECRET_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED]';
      continue;
    }

    // 2. Emails
    if (EMAIL_KEY_REGEX.test(key) && typeof value === 'string') {
      result[key] = maskEmail(value);
      continue;
    }

    // 3. Phone numbers
    if (PHONE_KEY_REGEX.test(key) && typeof value === 'string') {
      result[key] = maskPhone(value);
      continue;
    }

    // 4. Recursive nested objects/arrays
    if (typeof value === 'object' && value !== null) {
      result[key] = maskSensitiveData(value);
      continue;
    }

    result[key] = value;
  }

  return result as T;
}
