import { headers } from "next/headers";
import { Suspense } from "react";
import { APP_NAME, PLAN_LIMITS, PLAN_PRICES_USD_MONTHLY, type Plan, type WidgetConfig } from "@askwell/shared";
import { EmbedPanel, type InitialMessage } from "../embed/embed-panel";
import { Spinner } from "../ui/spinner";
import { Section } from "./section";

const count = (value: number, noun: string) =>
  `${value.toLocaleString("en-US")} ${value === 1 ? noun : `${noun}s`}`;

function planSummary(plan: Plan): string {
  const { projects, messagesPerMonth, knowledgeSources } = PLAN_LIMITS[plan];
  return `${count(projects, "project")}, ${count(messagesPerMonth, "message")} a month per project and ${count(knowledgeSources, "knowledge source")} per project`;
}

/** The scripted sample shown before the visitor types. Display only: never sent or stored. */
export const SAMPLE_CONVERSATION: readonly InitialMessage[] = [
  { from: "visitor", text: "How do I add it to my site?" },
  { from: "bot", text: "Copy the script tag from your project's Install page and paste it before </body>." },
  { from: "visitor", text: "What do I get for free?" },
  {
    from: "bot",
    text: `Free is $${PLAN_PRICES_USD_MONTHLY.free} a month: ${planSummary("free")}. Pro is $${PLAN_PRICES_USD_MONTHLY.pro} a month: ${planSummary("pro")}.`,
  },
];

export const SAMPLE_DIVIDER = "Your turn: ask anything";

function Frame({ intro, children }: { intro?: string; children?: React.ReactNode }) {
  return (
    <Section id="demo" title="Live demo" intro={intro}>
      {children ? <div className="max-w-2xl">{children}</div> : null}
    </Section>
  );
}

const Unavailable = () => <Frame intro="The live demo is not available right now." />;

/**
 * The widget's config for the demo, or null if it can't be shown. Rate limited before the
 * database read, like /embed (project.md §9, "Cost abuse").
 */
async function loadConfig(key: string): Promise<WidgetConfig | null> {
  // Imported here: both are server-only, and the page without a key never needs them.
  const [{ protectConfig }, { getWidgetConfigByKey }] = await Promise.all([
    import("../../lib/security/arcjet"),
    import("../../lib/widget/config"),
  ]);
  const request = new Request("http://localhost/", { headers: new Headers(await headers()) });
  if ((await protectConfig(request, { publicKey: key })) === "rate_limited") return null;
  try {
    return await getWidgetConfigByKey(key);
  } catch (error) {
    console.error("Landing demo: could not load the widget config", error);
    return null;
  }
}

/** The real chat panel, open in the page, answering from the project about the app itself. */
export async function LiveDemo({ widgetKey }: { widgetKey: string }) {
  const config = await loadConfig(widgetKey);
  if (!config) return <Unavailable />;
  return (
    <Frame intro={`This is the real ${APP_NAME} chat, answering from a project about ${APP_NAME} itself.`}>
      <EmbedPanel
        publicKey={widgetKey}
        config={config}
        hostOrigin={null}
        inline
        initialMessages={SAMPLE_CONVERSATION}
        initialDivider={SAMPLE_DIVIDER}
      />
    </Frame>
  );
}

export function Demo({ widgetKey }: { widgetKey: string | null }) {
  if (!widgetKey) return <Unavailable />;
  return (
    <Suspense
      fallback={
        <Frame>
          <p role="status" className="flex h-[460px] items-center justify-center gap-2 text-sm text-ink-muted md:h-[520px]">
            <Spinner />
            Loading the demo…
          </p>
        </Frame>
      }
    >
      <LiveDemo widgetKey={widgetKey} />
    </Suspense>
  );
}
