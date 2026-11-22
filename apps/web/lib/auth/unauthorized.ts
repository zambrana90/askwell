// Literal shape of the API error from project.md. Swap for the shared ApiError
// helper once packages/shared exports one.
export function unauthorizedResponse(): Response {
  return Response.json(
    { error: { code: "unauthorized", message: "Sign in to use this endpoint." } },
    { status: 401 },
  );
}
