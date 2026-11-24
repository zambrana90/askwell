import "server-only";
import { after } from "next/server";
import { captureServer } from "./server";

/**
 * The owner-side product events (project.md §6.11). Distinct id: the owner's Clerk user id.
 * Properties are ids and fixed values only, never text, file names or emails.
 * Each is sent after the response and never throws or slows the request.
 */
function send(ownerId: string, event: string, props?: Record<string, string>): void {
  const task = () => captureServer(ownerId, event, props); // never throws
  try {
    after(task);
  } catch {
    void task(); // no request scope
  }
}

export const trackSignedUp = (userId: string) => send(userId, "signed_up");

export const trackProjectCreated = (userId: string, projectId: string) =>
  send(userId, "project_created", { projectId });

export const trackKnowledgeAdded = (userId: string, projectId: string, type: string) =>
  send(userId, "knowledge_added", { projectId, type });

/** For Phase 5's Clerk billing webhook. */
export const trackUpgraded = (userId: string) => send(userId, "upgraded");
