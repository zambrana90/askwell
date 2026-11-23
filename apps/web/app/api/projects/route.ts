import { auth } from "@clerk/nextjs/server";
import {
  DEFAULT_WIDGET_CONFIG,
  PLAN_LIMITS,
  createProjectRequestSchema,
} from "@askwell/shared";
import type { CreateProjectResponse, ProjectListResponse } from "@askwell/shared";
import { ensureAccount } from "../../../lib/accounts";
import {
  PROJECT_COLUMNS,
  errorResponse,
  generatePublicKey,
  getPlan,
  toProject,
} from "../../../lib/projects/projects";
import { createOwnerClient } from "../../../lib/supabase/owner";
import { createServiceClient } from "../../../lib/supabase/service";

const UNIQUE_VIOLATION = "23505";
const PLAN_LIMIT_ERRCODE = "P0001";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  // RLS scopes this to the caller's projects. No manual owner filter.
  const { data, error } = await createOwnerClient()
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) return errorResponse("internal", "Could not load projects.");

  return Response.json({ projects: data.map(toProject) } satisfies ProjectListResponse);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const body: unknown = await request.json().catch(() => undefined);
  const parsed = createProjectRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("validation_error", "A project name is required.");

  try {
    await ensureAccount(userId);
    const plan = await getPlan(userId);
    const maxProjects = PLAN_LIMITS[plan].projects;
    const c = DEFAULT_WIDGET_CONFIG;
    const service = createServiceClient();

    // One retry with a new key if the random key collides (it practically never does).
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await service.rpc("create_project", {
        p_owner_id: userId,
        p_name: parsed.data.name,
        p_public_key: generatePublicKey(),
        p_max_projects: maxProjects,
        p_button_color: c.buttonColor,
        p_position: c.position,
        p_label: c.label,
        p_animation: c.animation,
        p_header_text: c.headerText,
        p_show_badge: c.showBadge,
      });
      if (!error) {
        return Response.json({ project: toProject(data) } satisfies CreateProjectResponse, {
          status: 201,
        });
      }
      if (error.code === PLAN_LIMIT_ERRCODE && error.message === "plan_limit") {
        return errorResponse(
          "plan_limit",
          `Your plan allows ${maxProjects} project${maxProjects === 1 ? "" : "s"}. Upgrade to add more.`,
        );
      }
      if (error.code !== UNIQUE_VIOLATION) break;
    }
  } catch {
    // fall through to the generic error
  }
  return errorResponse("internal", "Could not create the project.");
}
