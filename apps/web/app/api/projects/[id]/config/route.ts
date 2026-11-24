import { auth } from "@clerk/nextjs/server";
import { applyPlanToConfig, idParamsSchema, updateConfigRequestSchema } from "@askwell/shared";
import type { UpdateConfigResponse } from "@askwell/shared";
import { errorResponse, getOwnedProject, getPlan } from "../../../../../lib/projects/projects";
import { saveWidgetConfig } from "../../../../../lib/widget/save-config";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return errorResponse("validation_error", "Invalid project id.");

  try {
    // Owner client: RLS decides. Someone else's project is a 404.
    const project = await getOwnedProject(params.data.id);
    if (!project) return errorResponse("not_found", "Project not found.");

    // The plan is read here, on the server, and checked before the body is even parsed.
    const plan = await getPlan(userId);
    if (plan !== "pro") return errorResponse("payment_required", "Customizing the widget is a Pro feature.");

    const body: unknown = await request.json().catch(() => undefined);
    const parsed = updateConfigRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse("validation_error", "Send at least one valid widget setting.");

    // Service client, only now that ownership and plan are checked.
    const saved = await saveWidgetConfig(project.id, parsed.data);
    return Response.json({ config: applyPlanToConfig(saved, plan) } satisfies UpdateConfigResponse);
  } catch (err) {
    console.error("save widget config failed:", err instanceof Error ? err.message : "unknown error");
    return errorResponse("internal", "Could not save the settings.");
  }
}
