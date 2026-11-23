import { VISITOR_ID_STORAGE_KEY } from "@askwell/shared/embed";

// Fallback when storage is blocked (third-party iframes often cannot use it).
let memoryId: string | null = null;

/** Random id kept in the iframe's localStorage and reused across visits. */
export function getVisitorId(): string {
  try {
    const stored = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
    if (stored) return stored;
    const id = memoryId ?? crypto.randomUUID();
    window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, id);
    memoryId = id;
    return id;
  } catch {
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}

/** Tests only. */
export function resetVisitorMemory(): void {
  memoryId = null;
}
