import { APP_NAME } from "@askwell/shared";
import { Panel } from "../ui/panel";
import { Section } from "./section";

/** A static, non-interactive mock of the widget. The live widget replaces it later. */
export function Demo() {
  return (
    <Section id="demo" title="Live demo" intro="A preview of the chat your visitors see. The live widget comes later.">
      <div className="relative mx-auto max-w-sm" role="img" aria-label="Preview of the chat widget">
        <Panel className="flex flex-col gap-3 p-4">
          <p className="border-b border-glass-edge pb-3 text-sm font-semibold">{APP_NAME}</p>
          <p className="max-w-[80%] self-end rounded-glass bg-accent px-3 py-2 text-sm text-accent-ink">
            Do you ship to Canada?
          </p>
          <p className="max-w-[80%] self-start rounded-glass border border-glass-edge px-3 py-2 text-sm">
            Yes. Orders to Canada arrive in 5 to 7 business days.
          </p>
          <p className="rounded-glass border border-glass-edge px-3 py-2 text-sm text-ink-muted">Ask a question…</p>
        </Panel>
        <div className="mt-4 flex justify-end">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-glass" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M4 5h16v11H9l-5 4z" />
            </svg>
          </span>
        </div>
      </div>
    </Section>
  );
}
