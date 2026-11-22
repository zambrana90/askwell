import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { APP_NAME } from "@askwell/shared";
import { DashboardNav } from "../../components/dashboard/nav";
import { ErrorState } from "../../components/ui/error-state";
import { ensureAccount } from "../../lib/accounts";
import { NAV_ITEMS } from "./nav-items";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The user ID comes from the server-side session, never from the client.
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let accountReady = true;
  try {
    await ensureAccount(userId);
  } catch (error) {
    console.error("Could not ensure the account row", error);
    accountReady = false;
  }

  return (
    <div className="theme-light min-h-screen bg-canvas text-ink">
      {accountReady ? (
        <>
          <DashboardNav appName={APP_NAME} items={NAV_ITEMS} userMenu={<UserButton />} />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </>
      ) : (
        <main className="mx-auto max-w-5xl px-4 py-8">
          <ErrorState description="We couldn't load your account. Please reload the page." />
        </main>
      )}
    </div>
  );
}
