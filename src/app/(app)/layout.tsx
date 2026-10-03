import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { BadgeToasts } from "@/components/badges/BadgeToasts";
import { AppNav } from "@/components/nav/AppNav";
import { createClient } from "@/lib/supabase/server";

import styles from "./app.module.css";

/**
 * Gate for every signed-in route.
 *
 * `getUser()` is used rather than `getSession()` because it revalidates the
 * token against the Supabase auth server. `getSession()` only decodes the
 * cookie, which the client controls, so it must never be the basis for an
 * access decision on the server.
 *
 * src/proxy.ts also redirects unauthenticated requests, but that is a
 * convenience so users do not flash a protected page — this layout is the
 * check that actually protects the route.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/dashboard" className={styles.brand}>
            MEDHVARA
          </Link>
          <AppNav />
        </div>
        <div className={styles.headerRight}>
          <Link href="/profile" className={styles.email}>
            {user.email}
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      {/* useSearchParams needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <BadgeToasts />
      </Suspense>
    </div>
  );
}
