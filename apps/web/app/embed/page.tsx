import type { Metadata } from "next";
import { publicKeySchema, type WidgetConfig } from "@askwell/shared";
import { EmbedPanel } from "../../components/embed/embed-panel";
import { parseHostOrigin } from "../../lib/embed/origin";
import { getWidgetConfigByKey } from "../../lib/widget/config";

// Runs inside the widget's iframe on customer sites. Not for search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function EmbedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const key = publicKeySchema.safeParse(first(params.key));
  // Bad or unknown key: render nothing (no error text, nothing to probe).
  if (!key.success) return null;

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
      hostOrigin={parseHostOrigin(first(params.origin))}
    />
  );
}
