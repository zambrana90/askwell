import type { ReactNode } from "react";
import { Panel } from "../ui/panel";
import { Section } from "./section";

const STEPS: readonly { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Add your info",
    body: "Paste text or upload files. This is what the bot answers from.",
    // A document with lines.
    icon: <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 0v5h5M9 13h6M9 17h6" />,
  },
  {
    title: "Copy one script tag",
    body: "Paste it into your site. No other setup.",
    // Code brackets and a slash.
    icon: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  },
  {
    title: "Visitors get answers",
    body: "They ask in the chat and get replies based on your content.",
    // A speech bubble with a check.
    icon: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM9 12l2 2 4-4" />,
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" title="How it works">
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Panel className="landing-card h-full p-6">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl border border-glass-edge bg-glass">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {step.icon}
                  </svg>
                </span>
                <span className="text-sm tabular-nums text-ink-muted">Step {index + 1}</span>
              </div>
              <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
            </Panel>
          </li>
        ))}
      </ol>
    </Section>
  );
}
