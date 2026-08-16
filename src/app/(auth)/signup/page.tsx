import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "@/lib/supabase/auth-actions";
import { createClient } from "@/lib/supabase/server";

import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Sign up · MEDHVARA" };

export default async function SignUpPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <>
      <div>
        <h1 className={styles.heading}>Create your account</h1>
        <p className={styles.subheading}>
          Sign up with your email address to get started.
        </p>
      </div>

      <AuthForm
        action={signUp}
        submitLabel="Sign up"
        passwordAutoComplete="new-password"
      />

      <p className={styles.switch}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </>
  );
}
