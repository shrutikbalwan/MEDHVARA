"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AuthState } from "@/lib/supabase/auth-actions";

import styles from "./AuthForm.module.css";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? "Working…" : label}
    </button>
  );
}

export function AuthForm({
  action,
  submitLabel,
  passwordAutoComplete,
}: {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  submitLabel: string;
  /** "new-password" on sign up, "current-password" on login. */
  passwordAutoComplete: "new-password" | "current-password";
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.field}>
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </label>

      <label className={styles.field}>
        <span>Password</span>
        <input
          type="password"
          name="password"
          autoComplete={passwordAutoComplete}
          required
          minLength={6}
          placeholder="At least 6 characters"
        />
      </label>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p className={styles.notice} role="status">
          {state.notice}
        </p>
      ) : null}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
