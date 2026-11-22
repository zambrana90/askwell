import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/error-state";

afterEach(cleanup);

test("button is disabled when disabled", () => {
  render(<Button disabled>Save</Button>);
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
});

test("button in loading state is disabled, busy and shows a spinner", () => {
  render(<Button loading>Save</Button>);
  const button = screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole("status")).toBeTruthy();
});

test("error state calls onRetry", () => {
  const onRetry = vi.fn();
  render(<ErrorState onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});
