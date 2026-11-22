export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_error",
  "plan_limit",
  "payment_required",
  "quota_exceeded",
  "rate_limited",
  "internal",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiError = { error: { code: ApiErrorCode; message: string } };

/** HTTP status for each code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 400,
  plan_limit: 403,
  payment_required: 402,
  quota_exceeded: 429,
  rate_limited: 429,
  internal: 500,
};

export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } };
}
