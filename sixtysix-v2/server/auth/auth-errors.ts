export class EmailAuthError extends Error {
  constructor(readonly code: 'RATE_LIMITED' | 'TEMPORARILY_UNAVAILABLE', readonly retryAfter = 0) { super(code); }
}
