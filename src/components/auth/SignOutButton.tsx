"use client";

import { useFormStatus } from "react-dom";

import { signOut } from "@/lib/supabase/auth-actions";

import styles from "./SignOutButton.module.css";

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.button} disabled={pending}>
      {pending ? "Signing out…" : "Log out"}
    </button>
  );
}

/**
 * A form posting to a Server Action rather than an onClick handler, so logout
 * still works if the page's JavaScript has not loaded.
 */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button />
    </form>
  );
}
