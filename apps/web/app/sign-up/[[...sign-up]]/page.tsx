import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Suspense>
        <SignUp />
      </Suspense>
    </main>
  );
}
