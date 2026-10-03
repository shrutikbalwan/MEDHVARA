"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import styles from "./app.module.css";

/**
 * Error boundary for every signed-in page. It sits inside (app)/layout.tsx,
 * so the header and navigation stay usable while one page has failed.
 *
 * Server-side errors arrive with only a generic message plus `digest`, which
 * matches the "digest:" line in the server (Vercel) logs — that is what to
 * search for. Client-side errors arrive with their real message.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    console.error(
      `[app] FAILED stage=render path=${pathname}` +
        (error.digest ? ` digest=${error.digest}` : "") +
        `\n  message: ${error.message}`,
      error,
    );
  }, [error, pathname]);

  return (
    <div role="alert">
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.lede}>
        This page hit an error while loading. Your data is safe — try again, or
        head back to the dashboard.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            padding: "10px 18px",
            border: "none",
            borderRadius: 9,
            background: "var(--foreground)",
            color: "var(--background)",
            font: "inherit",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <Link href="/dashboard" className={styles.back} style={{ marginTop: 0, alignSelf: "center" }}>
          Go to dashboard
        </Link>
      </div>
      {error.digest ? (
        <p className={styles.lede} style={{ fontSize: 12, marginTop: 24 }}>
          Error reference: <code>{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
