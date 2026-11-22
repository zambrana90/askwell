import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";

// Placeholder. B2 replaces it.
export default async function DashboardPage() {
  const user = await currentUser();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p>{user?.primaryEmailAddress?.emailAddress}</p>
      <UserButton />
    </main>
  );
}
