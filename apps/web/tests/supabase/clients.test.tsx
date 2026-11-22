import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getToken = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ getToken }) }));

import { createOwnerClient } from "../../lib/supabase/owner";
import { SERVICE_KEY_ENV, createServiceClient } from "../../lib/supabase/service";

const URL_ = "https://example.supabase.co";
const PUBLISHABLE = "sb_publishable_test";
const SECRET = "sb_secret_test";

const fetchMock = vi.fn();

function lastHeaders(): Headers {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
  return new Headers(init.headers);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv(SERVICE_KEY_ENV, SECRET);
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  getToken.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createOwnerClient", () => {
  it("sends the owner's Clerk token as the Bearer token, with the publishable key", async () => {
    getToken.mockResolvedValue("clerk-session-token");
    const { error, data } = await createOwnerClient().from("accounts").select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url.startsWith(`${URL_}/rest/v1/accounts`)).toBe(true);
    expect(lastHeaders().get("authorization")).toBe("Bearer clerk-session-token");
    expect(lastHeaders().get("apikey")).toBe(PUBLISHABLE);
  });

  it("never sends the secret key", async () => {
    getToken.mockResolvedValue("t");
    await createOwnerClient().from("accounts").select();
    expect(JSON.stringify([...lastHeaders().entries()])).not.toContain(SECRET);
  });

  it("names the missing variable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => createOwnerClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => createOwnerClient()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});

describe("createServiceClient", () => {
  it("authenticates with the secret key", async () => {
    const { error } = await createServiceClient().from("accounts").select();
    expect(error).toBeNull();
    expect(lastHeaders().get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(lastHeaders().get("apikey")).toBe(SECRET);
    expect(getToken).not.toHaveBeenCalled();
  });

  it("throws a clear error when the secret key is missing", () => {
    vi.stubEnv(SERVICE_KEY_ENV, "");
    expect(() => createServiceClient()).toThrow(new RegExp(SERVICE_KEY_ENV));
  });

  it("throws a clear error when the URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => createServiceClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
