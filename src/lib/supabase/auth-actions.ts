"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  notice?: string;
};

/**
 * Server Actions are reachable by direct POST, not only through our forms, so
 * every field is re-validated here rather than trusting the browser's
 * `required` / `type="email"` attributes.
 */
function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." } as const;
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." } as const;
  }
  return { email, password } as const;
}

/** Absolute origin for email confirmation links. */
async function getOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = readCredentials(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) return { error: error.message };

  // With "Confirm email" enabled (the Supabase default) `session` is null and
  // the user must click the emailed link before they can sign in.
  //
  // Note: when the address already belongs to a confirmed account, Supabase
  // deliberately returns an obfuscated user object rather than an error, so
  // that this endpoint cannot be used to enumerate registered emails. That is
  // why the message below is identical either way — do not "improve" it into
  // "account already exists", which would reintroduce the leak.
  if (!data.session) {
    return {
      notice: `Check ${parsed.email} for a confirmation link to finish signing up.`,
    };
  }

  // "Confirm email" disabled — the user is already signed in.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signIn(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = readCredentials(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password,
  });

  // Supabase returns a single generic message for both a wrong password and an
  // unknown address; passing it through keeps that property intact.
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  // Called outside try/catch on purpose: redirect() signals by throwing.
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
