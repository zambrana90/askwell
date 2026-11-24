import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const deferred: Array<() => Promise<unknown>> = [];
vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => void deferred.push(task) }));
const captureServer = vi.fn();
vi.mock("../../lib/analytics/server", () => ({ captureServer: (...a: unknown[]) => captureServer(...a) }));
const posthog = { __loaded: true, capture: vi.fn() };
vi.mock("posthog-js", () => ({ default: posthog }));

import { trackSnippetCopied } from "../../lib/analytics/client";
import { trackKnowledgeAdded, trackProjectCreated, trackSignedUp, trackUpgraded } from "../../lib/analytics/events";

beforeEach(() => {
  deferred.length = 0;
  captureServer.mockReset().mockResolvedValue(undefined);
  posthog.__loaded = true;
  posthog.capture.mockReset();
});

describe("server events", () => {
  test.each([
    ["signed_up", () => trackSignedUp("user_1"), undefined],
    ["project_created", () => trackProjectCreated("user_1", "p1"), { projectId: "p1" }],
    ["knowledge_added", () => trackKnowledgeAdded("user_1", "p1", "pdf"), { projectId: "p1", type: "pdf" }],
    ["upgraded", () => trackUpgraded("user_1"), undefined],
  ])("%s: sent once, after the response, with only the listed props", async (event, track, props) => {
    track();
    expect(captureServer).not.toHaveBeenCalled();
    for (const task of deferred) await task();
    expect(captureServer.mock.calls).toEqual([["user_1", event, props]]);
  });
});

describe("trackSnippetCopied", () => {
  test("captures snippet_copied with the project id only", async () => {
    await trackSnippetCopied("p1");
    expect(posthog.capture.mock.calls).toEqual([["snippet_copied", { projectId: "p1" }]]);
  });

  test("does nothing when PostHog is not initialised", async () => {
    posthog.__loaded = false;
    await trackSnippetCopied("p1");
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  test("never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    posthog.capture.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(trackSnippetCopied("p1")).resolves.toBeUndefined();
  });
});
