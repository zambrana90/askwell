import "server-only";
import OpenAI from "openai";

let client: OpenAI | undefined;

/** Lazily created so importing this module never needs the key (tests, build). */
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey });
  }
  return client;
}
