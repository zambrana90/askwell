import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { AUTH_APPEARANCE } from "../../../components/auth/appearance";
import { AuthShell } from "../../../components/auth/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell>
      <Suspense>
        <SignIn appearance={AUTH_APPEARANCE} />
      </Suspense>
    </AuthShell>
  );
}
