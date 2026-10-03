"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it must render its own <html> and <body> and cannot rely
 * on globals.css. Page-level errors are handled by src/app/(app)/error.tsx.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(
      "[app] FAILED stage=root-layout" +
        (error.digest ? ` digest=${error.digest}` : "") +
        `\n  message: ${error.message}`,
      error,
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          fontFamily: "Arial, Helvetica, sans-serif",
          colorScheme: "light dark",
        }}
      >
        <title>Something went wrong · MEDHVARA</title>
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.75, lineHeight: 1.6 }}>
            MEDHVARA could not load. Please try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: "10px 18px", borderRadius: 9, font: "inherit", cursor: "pointer" }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: 20, fontSize: 12, opacity: 0.6 }}>
              Error reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
