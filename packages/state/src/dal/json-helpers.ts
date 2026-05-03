/**
 * Helpers for serializing/deserializing JSON columns in SQLite.
 *
 * SQLite stores JSON as TEXT. The DAL modules use these helpers so
 * callers always see parsed TypeScript types, never raw JSON strings.
 */

export function toJson<T>(value: T | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

export function fromJson<T>(raw: string | null | undefined): T | null {
  if (raw === null || raw === undefined) return null;
  return JSON.parse(raw) as T;
}

/** Convert a SQLite 0/1 integer to boolean. */
export function toBool(value: number): boolean {
  return value !== 0;
}

/** Convert a boolean to SQLite 0/1 integer. */
export function fromBool(value: boolean): number {
  return value ? 1 : 0;
}
