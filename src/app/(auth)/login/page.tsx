import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "@/lib/supabase/auth-actions";
import { createClient } from "@/lib/supabase/server";

import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Log in · MEDHVARA" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  // Set by /auth/confirm when a confirmation link is expired or already used.
  const { error } = await searchParams;

  return (
    <>
      <div>
        <h1 className={styles.heading}>Log in</h1>
        <p className={styles.subheading}>Welcome back to MEDHVARA.</p>
      </div>

      {error ? (
        <p className={styles.linkError} role="alert">
          {error}
        </p>
      ) : null}

      <AuthForm
        action={signIn}
        submitLabel="Log in"
        passwordAutoComplete="current-password"
      />

      <p className={styles.switch}>
        No account yet? <Link href="/signup">Sign up</Link>
      </p>
    </>
  );
}
