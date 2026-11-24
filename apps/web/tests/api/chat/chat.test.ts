import { beforeEach, describe, expect, test, vi } from "vitest";
import { PLAN_LIMITS } from "@askwell/shared";

vi.mock("server-only", () => ({}));

// after() needs a request scope: collect the tasks and run them on demand.
const deferred: Array<() => Promise<unknown>> = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => void deferred.push(task),
}));
const runDeferred = async () => {
  for (const task of deferred.splice(0)) await task();
};
const captureServer = vi.fn();
vi.mock("../../../lib/analytics/server", () => ({ captureServer: (...a: unknown[]) => captureServer(...a) }));

const protectChat = vi.fn();
vi.mock("../../../lib/security/arcjet", () => ({ protectChat: (...a: unknown[]) => protectChat(...a) }));
const embedQuery = vi.fn();
vi.mock("../../../lib/ai/embeddings", () => ({ embedQuery: (...a: unknown[]) => embedQuery(...a) }));
const answerQuestion = vi.fn();
vi.mock("../../../lib/ai/answer", () => ({
  answerQuestion: (...a: unknown[]) => answerQuestion(...a),
  MAX_HISTORY_MESSAGES: 6,
}));

// Fake service client: each table has a queued result, every query chain ends in maybeSingle/limit.
const tables: Record<string, { data: unknown; error: { message: string } | null }> = {};
const calls: Record<string, unknown[]> = {};
const rpc = vi.fn();
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) b[m] = (...args: unknown[]) => ((calls[`${table}.${m}`] ??= []).push(args), b);
  b.maybeSingle = async () => tables[table];
  b.limit = async (...args: unknown[]) => ((calls[`${table}.limit`] ??= []).push(args), tables[table]);
  return b;
}
vi.mock("../../../lib/supabase/service", () => ({
  createServiceClient: () => ({ from: (t: string) => builder(t), rpc: (...a: unknown[]) => rpc(...a) }),
}));

import { OPTIONS, POST } from "../../../app/api/widget/chat/route";

const KEY = "pk_abcdef123456";
const CONV = "11111111-1111-4111-8111-111111111111";
const body = (o: Record<string, unknown> = {}) => ({ key: KEY, visitorId: "v1", message: "Hello?", ...o });
const post = (b: unknown) =>
  POST(new Request("http://localhost/api/widget/chat", { method: "POST", body: typeof b === "string" ? b : JSON.stringify(b) }));
const rpcNames = () => rpc.mock.calls.map((c) => c[0]);

beforeEach(() => {
  deferred.length = 0;
  captureServer.mockReset().mockResolvedValue(undefined);
  for (const k of Object.keys(calls)) delete calls[k];
  protectChat.mockReset().mockResolvedValue("allow");
  embedQuery.mockReset().mockResolvedValue([0.1, 0.2]);
  answerQuestion.mockReset().mockResolvedValue("The answer.");
  vi.spyOn(console, "error").mockImplementation(() => {});
  tables.projects = { data: { id: "p1", accounts: { plan: "free" } }, error: null };
  tables.conversations = { data: { id: CONV }, error: null };
  tables.messages = { data: [], error: null };
  rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === "consume_message") return { data: true, error: null };
    if (name === "match_chunks") return { data: [{ content: "chunk A" }, { content: "chunk B" }], error: null };
    return { data: CONV, error: null };
  });
});

describe("POST /api/widget/chat", () => {
  test.each([
    ["bad JSON", "{nope"],
    ["missing message", body({ message: undefined })],
    ["blank message", body({ message: "   " })],
    ["bad conversation id", body({ conversationId: "x" })],
  ])("400 validation_error on %s", async (_n, b) => {
    const res = await post(b);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(protectChat).not.toHaveBeenCalled();
  });

  test("429 rate_limited from Arcjet: nothing counted or saved", async () => {
    protectChat.mockResolvedValue("rate_limited");
    const res = await post(body());
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("rate_limited");
    expect(rpc).not.toHaveBeenCalled();
    expect(embedQuery).not.toHaveBeenCalled();
  });

  test("403 forbidden on injection: nothing counted or saved", async () => {
    protectChat.mockResolvedValue("injection");
    const res = await post(body());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toEqual({ code: "forbidden", message: "Sorry, I can't help with that." });
    expect(rpc).not.toHaveBeenCalled();
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  test("404 for an unknown key: nothing counted", async () => {
    tables.projects = { data: null, error: null };
    const res = await post(body());
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(rpc).not.toHaveBeenCalled();
  });

  test("404 for a conversation of another project or visitor: nothing counted", async () => {
    tables.conversations = { data: null, error: null };
    const res = await post(body({ conversationId: CONV }));
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    expect(answerQuestion).not.toHaveBeenCalled();
    expect(calls["conversations.eq"]).toEqual([["id", CONV], ["project_id", "p1"], ["visitor_id", "v1"]]);
  });

  test("429 quota_exceeded: no OpenAI call", async () => {
    rpc.mockImplementation(async () => ({ data: false, error: null }));
    const res = await post(body());
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("quota_exceeded");
    expect(rpc).toHaveBeenCalledWith("consume_message", {
      p_project_id: "p1",
      p_limit: PLAN_LIMITS.free.messagesPerMonth,
    });
    expect(embedQuery).not.toHaveBeenCalled();
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  test("the plan is read on the server: Pro gets the Pro limit", async () => {
    tables.projects = { data: { id: "p1", accounts: [{ plan: "pro" }] }, error: null };
    await post(body());
    expect(rpc).toHaveBeenCalledWith("consume_message", {
      p_project_id: "p1",
      p_limit: PLAN_LIMITS.pro.messagesPerMonth,
    });
  });

  test("model error: 500 internal, counted, not saved", async () => {
    answerQuestion.mockRejectedValue(new Error("Empty model reply"));
    const res = await post(body());
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
    expect(rpcNames()).toEqual(["consume_message", "match_chunks"]);
  });

  test("success: first message creates a conversation and saves the turn", async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ conversationId: CONV, reply: "The answer." });
    expect(rpcNames()).toEqual(["consume_message", "match_chunks", "save_chat_turn"]);
    expect(rpc).toHaveBeenCalledWith("match_chunks", {
      p_project_id: "p1",
      p_embedding: JSON.stringify([0.1, 0.2]),
      p_match_count: 5,
    });
    expect(answerQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ question: "Hello?", chunks: ["chunk A", "chunk B"], history: [] }),
    );
    expect(rpc).toHaveBeenCalledWith("save_chat_turn", {
      p_project_id: "p1",
      p_conversation_id: null,
      p_visitor_id: "v1",
      p_visitor_body: "Hello?",
      p_bot_body: "The answer.",
    });
    expect(calls["conversations.select"]).toBeUndefined(); // no conversation lookup without an id
  });

  test("a follow-up passes at most 6 history messages, oldest first", async () => {
    // The query returns newest first (order desc, limit 6).
    tables.messages = {
      data: [
        { role: "bot", body: "m6" },
        { role: "visitor", body: "m5" },
        { role: "bot", body: "m4" },
        { role: "visitor", body: "m3" },
        { role: "bot", body: "m2" },
        { role: "visitor", body: "m1" },
      ],
      error: null,
    };
    const res = await post(body({ conversationId: CONV }));
    expect(res.status).toBe(200);
    expect(calls["messages.limit"]).toEqual([[6]]);
    expect(calls["messages.order"]).toEqual([["created_at", { ascending: false }]]);
    const { history } = answerQuestion.mock.calls[0]![0];
    expect(history).toEqual([
      { role: "user", content: "m1" },
      { role: "assistant", content: "m2" },
      { role: "user", content: "m3" },
      { role: "assistant", content: "m4" },
      { role: "user", content: "m5" },
      { role: "assistant", content: "m6" },
    ]);
    expect(rpc).toHaveBeenCalledWith("save_chat_turn", expect.objectContaining({ p_conversation_id: CONV }));
  });

  test("a conversation that vanishes before save: 404", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "save_chat_turn"
        ? { data: null, error: { code: "P0002", message: "not_found" } }
        : name === "consume_message"
          ? { data: true, error: null }
          : { data: [], error: null },
    );
    const res = await post(body({ conversationId: CONV }));
    expect(res.status).toBe(404);
  });

  test("a database error: 500 internal, no detail leaked", async () => {
    tables.projects = { data: null, error: { message: "secret db detail" } };
    const res = await post(body());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
  });

  test("OPTIONS answers the CORS preflight", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  });
});

describe("chat tracking", () => {
  const events = () => captureServer.mock.calls as Array<[string, string, Record<string, unknown>]>;
  const named = (name: string) => events().filter((e) => e[1] === name);

  beforeEach(() => {
    tables.projects = { data: { id: "p1", owner_id: "user_owner", accounts: { plan: "free" } }, error: null };
    tables.conversations = { data: [{ id: CONV }], error: null };
    embedQuery.mockImplementation(async (_text: string, onCall: (c: unknown) => void) => {
      onCall({ kind: "embedding", model: "text-embedding-3-small", latencySeconds: 0.1, inputTokens: 3, isError: false });
      return [0.1];
    });
    answerQuestion.mockImplementation(async ({ onCall }: { onCall: (c: unknown) => void }) => {
      onCall({ kind: "generation", model: "gpt-5-mini", latencySeconds: 1.5, inputTokens: 100, outputTokens: 20, isError: false });
      return "SECRET REPLY";
    });
  });

  test("traces every OpenAI call for the owner, grouped by conversation, with no text", async () => {
    await post(body({ message: "SECRET QUESTION" }));
    expect(captureServer).not.toHaveBeenCalled(); // nothing is sent before the response
    await runDeferred();
    const [generation] = named("$ai_generation");
    expect(generation![0]).toBe("user_owner");
    expect(generation![2]).toMatchObject({
      projectId: "p1",
      $ai_trace_id: CONV,
      $ai_session_id: CONV,
      $ai_provider: "openai",
      $ai_model: "gpt-5-mini",
      $ai_input_tokens: 100,
      $ai_output_tokens: 20,
      $ai_latency: 1.5,
    });
    expect(named("$ai_embedding")).toHaveLength(1);
    const sent = JSON.stringify(events());
    for (const text of ["SECRET", "chunk A", "$ai_input\"", "$ai_output_choices"]) expect(sent).not.toContain(text);
  });

  test("a failed model call is still traced, under a generated id for a first message", async () => {
    answerQuestion.mockImplementation(async ({ onCall }: { onCall: (c: unknown) => void }) => {
      onCall({ kind: "generation", model: "gpt-5-mini", latencySeconds: 1, isError: true, httpStatus: 500 });
      throw new Error("boom");
    });
    expect((await post(body())).status).toBe(500);
    await runDeferred();
    const [generation] = named("$ai_generation");
    expect(generation![2]).toMatchObject({ $ai_is_error: true, $ai_http_status: 500 });
    expect(generation![2].$ai_session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(named("first_chat")).toHaveLength(0);
  });

  test.each([
    ["rate_limited", "rate_limit"],
    ["injection", "injection"],
  ])("message_blocked on %s, attributed to the owner", async (verdict, reason) => {
    protectChat.mockResolvedValue(verdict);
    await post(body({ message: "SECRET QUESTION" }));
    await runDeferred();
    expect(events()).toEqual([["user_owner", "message_blocked", { reason, projectId: "p1" }]]);
  });

  test("message_blocked for an unknown key uses the fixed widget id", async () => {
    protectChat.mockResolvedValue("rate_limited");
    tables.projects = { data: null, error: null };
    await post(body());
    await runDeferred();
    expect(events()).toEqual([["widget", "message_blocked", { reason: "rate_limit", $process_person_profile: false }]]);
  });

  test("first_chat on the project's first conversation", async () => {
    await post(body());
    await runDeferred();
    expect(named("first_chat")).toEqual([["user_owner", "first_chat", { projectId: "p1" }]]);
  });

  test("no first_chat when the project already had a conversation", async () => {
    tables.conversations = { data: [{ id: "22222222-2222-4222-8222-222222222222" }], error: null };
    await post(body());
    await runDeferred();
    expect(named("first_chat")).toHaveLength(0);
  });

  test("no first_chat on a follow-up message", async () => {
    tables.conversations = { data: { id: CONV }, error: null };
    await post(body({ conversationId: CONV }));
    await runDeferred();
    expect(named("first_chat")).toHaveLength(0);
  });

  test("a PostHog failure doesn't change the reply", async () => {
    captureServer.mockRejectedValue(new Error("posthog down"));
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversationId: CONV, reply: "SECRET REPLY" });
    await expect(runDeferred()).resolves.toBeUndefined();
  });
});
