import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InstallSnippet } from "../../../../../components/install/install-snippet";
import { loadOwnedProject } from "../../../../../components/projects/owned-project";
import { ErrorState } from "../../../../../components/ui/error-state";
import { buildInstallSnippet, resolveAppUrl } from "../../../../../lib/install/snippet";

export default async function InstallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadOwnedProject(id);
  if (!project) notFound();

  const h = await headers();
  const appUrl = resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL, {
    host: h.get("host"),
    forwardedHost: h.get("x-forwarded-host"),
    forwardedProto: h.get("x-forwarded-proto"),
  });
  if (!appUrl) {
    return <ErrorState description="We couldn't work out this app's address, so we can't build the snippet. Please contact support." />;
  }

  return (
    <section aria-labelledby="install-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="install-heading" className="text-lg font-semibold">
          Add the chat to your website
        </h2>
        <p className="mt-1 text-sm text-ink-muted">One script tag. It carries this project&apos;s public key.</p>
      </div>
      <InstallSnippet snippet={buildInstallSnippet({ appUrl, publicKey: project.publicKey })} />
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Copy the snippet.</li>
        <li>
          Paste it before the closing <code className="rounded bg-glass-edge px-1">&lt;/body&gt;</code> tag on every page
          where you want the chat.
        </li>
        <li>Reload your site. The chat button appears in the corner.</li>
      </ol>
    </section>
  );
}
