import { Panel } from "../ui/panel";
import { Section } from "./section";

const STEPS = [
  { title: "Add your info", body: "Paste text or upload files. This is what the bot answers from." },
  { title: "Copy one script tag", body: "Paste it into your site. No other setup." },
  { title: "Visitors get answers", body: "They ask in the chat and get replies based on your content." },
] as const;

export function HowItWorks() {
  return (
    <Section id="how-it-works" title="How it works">
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Panel className="h-full p-6">
              <span className="text-sm text-ink-muted">Step {index + 1}</span>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{step.body}</p>
            </Panel>
          </li>
        ))}
      </ol>
    </Section>
  );
}
