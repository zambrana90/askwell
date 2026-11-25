import type { Metadata } from "next";
import { headers } from "next/headers";
import { publicKeySchema, type WidgetConfig } from "@askwell/shared";
import { EmbedPanel } from "../../components/embed/embed-panel";
import { parseHostOrigin } from "../../lib/embed/origin";
import { protectConfig } from "../../lib/security/arcjet";
import { getWidgetConfigByKey } from "../../lib/widget/config";
import { Unavailable } from "./unavailable";

// Runs inside the widget's iframe on customer sites. Not for search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function EmbedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const key = publicKeySchema.safeParse(first(params.key));
  // Bad or unknown key: render nothing (no error text, nothing to probe).
  if (!key.success) return null;
  const hostOrigin = parseHostOrigin(first(params.origin));

  // Rate limit before the database read (project.md §9, "Cost abuse"). Same limit and counter as
  // GET /api/widget/config. A page gets no Request, so build one from the visitor's headers:
  // Arcjet takes the IP from them. Fails open.
  const request = new Request("http://localhost/embed", { headers: new Headers(await headers()) });
  if ((await protectConfig(request, { publicKey: key.data })) === "rate_limited") {
    return <Unavailable hostOrigin={hostOrigin} />;
  }

  let config: WidgetConfig | null = null;
  try {
    config = await getWidgetConfigByKey(key.data);
  } catch (error) {
    console.error("Embed: could not load the widget config", error);
  }
  if (!config) return null;

  return (
    <EmbedPanel
      publicKey={key.data}
      config={config}
      hostOrigin={hostOrigin}
    />
  );
}
