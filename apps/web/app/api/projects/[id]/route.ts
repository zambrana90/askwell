import { auth } from "@clerk/nextjs/server";
import { idParamsSchema, renameProjectRequestSchema } from "@askwell/shared";
import type { DeleteProjectResponse, RenameProjectResponse } from "@askwell/shared";
import { PROJECT_COLUMNS, errorResponse, toProject } from "../../../../lib/projects/projects";
import { createOwnerClient } from "../../../../lib/supabase/owner";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return errorResponse("validation_error", "Invalid project id.");
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = renameProjectRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("validation_error", "A project name is required.");

  // Owner client: RLS plus the column grant (name only). Someone else's project matches no row.
  const { data, error } = await createOwnerClient()
    .from("projects")
    .update({ name: parsed.data.name })
    .eq("id", params.data.id)
    .select(PROJECT_COLUMNS)
    .maybeSingle();
  if (error) return errorResponse("internal", "Could not rename the project.");
  if (!data) return errorResponse("not_found", "Project not found.");

  return Response.json({ project: toProject(data) } satisfies RenameProjectResponse);
}

export async function DELETE(_request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return errorResponse("validation_error", "Invalid project id.");

  // Cascades remove the config, knowledge, conversations and messages.
  const { data, error } = await createOwnerClient()
    .from("projects")
    .delete()
    .eq("id", params.data.id)
    .select("id");
  if (error) return errorResponse("internal", "Could not delete the project.");
  if (data.length === 0) return errorResponse("not_found", "Project not found.");

  return Response.json({ ok: true } satisfies DeleteProjectResponse);
}
