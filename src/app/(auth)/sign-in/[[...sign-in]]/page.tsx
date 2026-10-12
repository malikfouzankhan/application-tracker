import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <SignIn />
      </Suspense>
    </main>
  );
}
