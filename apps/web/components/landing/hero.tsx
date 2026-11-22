import { APP_NAME } from "@askwell/shared";
import { LinkButton } from "./link-button";

export function Hero() {
  return (
    <section className="reveal mx-auto max-w-3xl px-4 py-20 text-center md:py-28">
      <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{APP_NAME}</h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-ink-muted">
        A chat widget that answers your visitors from your own content. Add one line to your site.
      </p>
      <div className="mt-8">
        <LinkButton href="/sign-up">Start free</LinkButton>
      </div>
    </section>
  );
}
