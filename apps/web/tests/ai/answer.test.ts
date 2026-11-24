import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { answerQuestion, CHAT_MODEL, SYSTEM_PROMPT } from "../../lib/ai/answer";

beforeEach(() => {
  create.mockReset();
  process.env.OPENAI_API_KEY = "test";
});

describe("answerQuestion", () => {
  test("sends the system prompt, the chunks and at most 6 history messages", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: " Open 9-5. " } }] });
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m${i}`,
    }));
    const reply = await answerQuestion({
      question: "When are you open?",
      chunks: ["We are open 9-5.", "Closed Sundays."],
      history,
    });
    expect(reply).toBe("Open 9-5.");
    const args = create.mock.calls[0]?.[0];
    expect(args.model).toBe(CHAT_MODEL);
    expect(CHAT_MODEL).toBe("gpt-5-mini");
    expect(args.max_completion_tokens).toBeGreaterThan(0);
    expect(args.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(SYSTEM_PROMPT).toContain("I don't know");
    expect(args.messages).toHaveLength(1 + 6 + 1);
    expect(args.messages.slice(1, 7).map((m: { content: string }) => m.content)).toEqual([
      "m4", "m5", "m6", "m7", "m8", "m9",
    ]);
    const last = args.messages[7];
    expect(last.role).toBe("user");
    expect(last.content).toContain("We are open 9-5.");
    expect(last.content).toContain("Closed Sundays.");
    expect(last.content).toContain("When are you open?");
  });
});
