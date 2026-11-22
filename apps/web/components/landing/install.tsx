import { PUBLIC_KEY_PREFIX } from "@askwell/shared";
import { Panel } from "../ui/panel";
import { Section } from "./section";

const SNIPPET = `<script src="https://your-app.example/widget.js" data-key="${PUBLIC_KEY_PREFIX}…" async></script>`;

export function Install() {
  return (
    <Section id="install" title="Install" intro="Paste this before the closing body tag. Your own key is in the dashboard. This one is an example.">
      <Panel className="overflow-x-auto p-4">
        <pre className="text-sm">
          <code>{SNIPPET}</code>
        </pre>
      </Panel>
    </Section>
  );
}
