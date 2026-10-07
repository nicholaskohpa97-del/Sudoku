export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra fields merged into the JSON error body (e.g. name suggestions). */
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}
