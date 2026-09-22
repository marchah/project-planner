/** A value that may be absent. Any union of exactly `T` and `null` should be written as `Maybe<T>`;
 * prefer it over `T | undefined`. A richer union this cannot express stays as it is. */
export type Maybe<T> = T | null;
