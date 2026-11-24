import "server-only";
import arcjet, { detectPromptInjection, fixedWindow } from "@arcjet/next";

export type ChatProtection = "allow" | "rate_limited" | "injection";
export type ConfigProtection = "allow" | "rate_limited";

const WINDOW = "60s";
const CHAT_MAX = 20;
const CONFIG_MAX = 60;

// Keyed by IP (Arcjet's trusted detection) plus the project's public key.
const characteristics = ["ip.src", "publicKey"] as const;

function makeChat() {
  return arcjet({
    key: process.env.ARCJET_KEY ?? "",
    characteristics,
    rules: [
      fixedWindow({ mode: "LIVE", window: WINDOW, max: CHAT_MAX, characteristics }),
      detectPromptInjection({ mode: "LIVE" }),
    ],
  });
}

function makeConfig() {
  return arcjet({
    key: process.env.ARCJET_KEY ?? "",
    characteristics,
    rules: [fixedWindow({ mode: "LIVE", window: WINDOW, max: CONFIG_MAX, characteristics })],
  });
}

// Created on first use so importing this module never needs the key.
let chatClient: ReturnType<typeof makeChat> | undefined;
let configClient: ReturnType<typeof makeConfig> | undefined;
const chat = () => (chatClient ??= makeChat());
const config = () => (configClient ??= makeConfig());

/** Rate limit and prompt-injection check for the chat route. Fails open. */
export async function protectChat(
  request: Request,
  input: { publicKey: string; message: string },
): Promise<ChatProtection> {
  try {
    const decision = await chat().protect(request, {
      publicKey: input.publicKey,
      detectPromptInjectionMessage: input.message,
    });
    if (decision.isDenied()) {
      return decision.reason.isPromptInjection() ? "injection" : "rate_limited";
    }
    if (decision.isErrored()) {
      console.error("Arcjet error (chat), allowing request:", decision.reason.message);
    }
    return "allow";
  } catch (err) {
    console.error("Arcjet failure (chat), allowing request:", err);
    return "allow";
  }
}

/** Rate limit for the widget config route. Fails open. */
export async function protectConfig(
  request: Request,
  input: { publicKey: string },
): Promise<ConfigProtection> {
  try {
    const decision = await config().protect(request, { publicKey: input.publicKey });
    if (decision.isDenied()) return "rate_limited";
    if (decision.isErrored()) {
      console.error("Arcjet error (config), allowing request:", decision.reason.message);
    }
    return "allow";
  } catch (err) {
    console.error("Arcjet failure (config), allowing request:", err);
    return "allow";
  }
}
