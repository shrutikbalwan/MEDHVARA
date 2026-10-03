"use client";

import { useState } from "react";

import styles from "./CopyProfileLink.module.css";

/** Copies the absolute link to /profile/<userId> for sharing. */
export function CopyProfileLink({ userId }: { userId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const url = `${window.location.origin}/profile/${userId}`;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      // Clipboard access can be refused (permissions, non-HTTPS). Fall back
      // to showing the link so it can be copied by hand.
      window.prompt("Copy your profile link:", url);
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <button type="button" className={styles.button} onClick={() => void copy()}>
      <span aria-live="polite">{state === "copied" ? "✓ Link copied" : "Copy profile link"}</span>
    </button>
  );
}
