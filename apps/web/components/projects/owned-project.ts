import "server-only";
import { cache } from "react";
import { idSchema } from "@askwell/shared";
import { getOwnedProject } from "../../lib/projects/projects";

/**
 * The project for a route id, or null (bad id, missing, or not the caller's: RLS decides).
 * Cached per request so the layout and the page share one query.
 */
export const loadOwnedProject = cache(async (id: string) => {
  if (!idSchema.safeParse(id).success) return null;
  return getOwnedProject(id);
});
