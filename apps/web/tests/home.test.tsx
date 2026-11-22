import { render, screen } from "@testing-library/react";
import { APP_NAME } from "@askwell/shared";
import { expect, test } from "vitest";
import Home from "../app/page";

test("home page renders APP_NAME", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: APP_NAME })).toBeTruthy();
});
