import { UserButton } from "@clerk/nextjs";
import { APP_NAME } from "@askwell/shared";
import { DashboardNav } from "../../components/dashboard/nav";
import { NAV_ITEMS } from "./nav-items";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-light min-h-screen bg-canvas text-ink">
      <DashboardNav appName={APP_NAME} items={NAV_ITEMS} userMenu={<UserButton />} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
