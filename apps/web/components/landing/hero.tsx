import { APP_NAME } from "@askwell/shared";
import { LinkButton } from "./link-button";

export function Hero() {
  return (
    <section className="relative isolate">
      {/* Pulled up behind the header, so the glow starts at the top of the page. */}
      <div aria-hidden="true" className="landing-backdrop pointer-events-none absolute inset-x-0 -top-16 bottom-0 -z-10" />
      <div className="landing-enter mx-auto max-w-4xl px-4 pb-20 pt-24 text-center md:pb-28 md:pt-36">
        <h1 className="landing-headline font-semibold">{APP_NAME}</h1>
        <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-ink-muted md:text-xl">
          A chat widget that answers your visitors from your own content. Add one line to your site.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <LinkButton href="/sign-up" size="large">
            Start free
          </LinkButton>
          <LinkButton href="#demo" variant="secondary" size="large">
            Try the demo
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
