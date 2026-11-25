import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import { AUTH_APPEARANCE } from "../../../components/auth/appearance";
import { AuthShell } from "../../../components/auth/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <Suspense>
        <SignUp appearance={AUTH_APPEARANCE} />
      </Suspense>
    </AuthShell>
  );
}
