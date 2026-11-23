import { VISITOR_ID_STORAGE_KEY } from "@askwell/shared/embed";

// The first id chosen for this iframe. Kept for its whole life, so the id cannot change
// if storage becomes unavailable later. Also the fallback when storage is blocked.
let memoryId: string | null = null;

// crypto.randomUUID only exists in secure contexts. An iframe under a plain-http host is
// not one, and parseHostOrigin accepts http origins, so fall back to getRandomValues.
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Random id kept in the iframe's localStorage and reused across visits. */
export function getVisitorId(): string {
  if (memoryId) return memoryId;
  try {
    const stored = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
    if (stored) {
      memoryId = stored;
      return stored;
    }
  } catch {
    // Storage blocked: fall through to a new in-memory id.
  }
  const id = newId();
  memoryId = id;
  try {
    window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, id);
  } catch {
    // Blocked: the id lives in memory only.
  }
  return id;
}

/** Tests only. */
export function resetVisitorMemory(): void {
  memoryId = null;
}
