import type { ReactNode } from "react";

type SectionProps = { id: string; title: string; intro?: string; children: ReactNode };

export function Section({ id, title, intro, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="reveal mx-auto max-w-5xl px-4 py-14">
      <h2 id={`${id}-title`} className="text-2xl font-semibold md:text-3xl">
        {title}
      </h2>
      {intro ? <p className="mt-3 max-w-2xl text-ink-muted">{intro}</p> : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}
