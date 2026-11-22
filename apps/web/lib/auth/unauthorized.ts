import { API_ERROR_STATUS, apiError } from "@askwell/shared";

export function unauthorizedResponse(): Response {
  return Response.json(apiError("unauthorized", "Sign in to use this endpoint."), {
    status: API_ERROR_STATUS.unauthorized,
  });
}
