import { cleanup, render, screen } from "@testing-library/react";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { afterEach, describe, expect, test } from "vitest";
import { EmbedPanel } from "../../components/embed/embed-panel";

afterEach(cleanup);

// jsdom does no tabbing or scrolling, so those are checked in a browser.
describe.each([
  ["default", false],
  ["inline", true],
])("message list in %s mode", (_mode, inline) => {
  const panel = () => (
    <EmbedPanel publicKey="pk_abcdef123456" config={DEFAULT_WIDGET_CONFIG} hostOrigin={null} inline={inline} />
  );

  test("is focusable, named, and has a focus ring", () => {
    render(panel());
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log.tabIndex).toBe(0);
    expect(log.className).toContain("focus-visible:outline-2");
    log.focus();
    expect(document.activeElement).toBe(log);
  });

  test("comes before the input in tab order, and does not take focus by itself", () => {
    render(panel());
    expect(document.activeElement).toBe(document.body);
    const after = screen.getByRole("log").compareDocumentPosition(screen.getByLabelText("Your message"));
    expect(after & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
