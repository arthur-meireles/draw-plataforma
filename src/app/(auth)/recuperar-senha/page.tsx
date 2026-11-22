import { Suspense } from "react";
import { RecoverPassword } from "@/components/features/auth/recover-password";

export default function RecoverPasswordPage() {
  return (
    <Suspense>
      <RecoverPassword />
    </Suspense>
  );
}
