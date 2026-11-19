import { ValueTransformer } from 'typeorm';

/**
 * ValueTransformer ensuring database numeric/decimal strings (e.g. numeric(12, 2))
 * are cleanly hydrated to JavaScript numbers without altering undefined values
 * during partial updates.
 */
export const numericColumnTransformer: ValueTransformer = {
  to: (data?: number | null) => data,
  from: (data?: string | null) =>
    data === null || data === undefined ? data : parseFloat(data),
};
