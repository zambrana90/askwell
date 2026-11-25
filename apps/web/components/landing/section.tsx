import type { ReactNode } from "react";

/** The small label above each section title, by section id, so every section gets one. */
const EYEBROWS: Record<string, string> = {
  "how-it-works": "Three steps",
  demo: "Try it",
  pricing: "Plans",
  install: "Setup",
};

type SectionProps = { id: string; title: string; intro?: string; eyebrow?: string; children?: ReactNode };

export function Section({ id, title, intro, eyebrow = EYEBROWS[id], children }: SectionProps) {
  return (
    // scroll-mt clears the sticky header when jumping to a section.
    <section id={id} aria-labelledby={`${id}-title`} className="reveal mx-auto max-w-5xl scroll-mt-16 px-4 py-16 md:py-24">
      {eyebrow ? <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">{eyebrow}</p> : null}
      <h2 id={`${id}-title`} className="text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h2>
      {intro ? <p className="mt-4 max-w-2xl text-ink-muted">{intro}</p> : null}
      {children ? <div className="mt-10">{children}</div> : null}
    </section>
  );
}
