"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { loadEarnedBadges } from "@/lib/supabase/badge-actions";
import { BADGES_PARAM, type Badge } from "@/types/badge";

import styles from "./BadgeToasts.module.css";

const TOAST_MS = 5000;

/**
 * Small celebratory toasts — "💡 Badge earned: First Project!" — for the ids in
 * ?badges=… on any signed-in page. The parameter is removed straight away so
 * a refresh or a shared link does not replay them.
 *
 * Every award flow ends by putting the new ids in the URL — by redirecting
 * there (project create, profile save) or by replacing the current URL (quiz,
 * project edit) — so this one component covers them all.
 */
export function BadgeToasts() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  /**
   * Each toast's stagger delay is fixed when it is added. Deriving it from the
   * list position instead would restart the later toasts' timers every time an
   * earlier one closed.
   */
  const [toasts, setToasts] = useState<{ badge: Badge; delay: number }[]>([]);

  const param = searchParams.get(BADGES_PARAM);

  useEffect(() => {
    if (!param) return;
    let cancelled = false;

    // Only badges the user really holds come back, so a hand-edited link
    // cannot fake one.
    void loadEarnedBadges(param.split(",")).then((found) => {
      if (cancelled) return;
      setToasts((current) => [
        ...current,
        ...found
          .filter((badge) => !current.some((t) => t.badge.id === badge.id))
          .map((badge, index) => ({ badge, delay: index * 400 })),
      ]);
      const rest = new URLSearchParams(searchParams.toString());
      rest.delete(BADGES_PARAM);
      const query = rest.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });

    return () => {
      cancelled = true;
    };
  }, [param, pathname, router, searchParams]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.badge.id !== id));
  }, []);

  return (
    // Always mounted so screen readers announce toasts as they are added.
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map(({ badge, delay }) => (
        <Toast key={badge.id} badge={badge} delay={delay} onDone={dismiss} />
      ))}
    </div>
  );
}

function Toast({
  badge,
  delay,
  onDone,
}: {
  badge: Badge;
  /** Staggers several toasts so they do not all vanish at once. */
  delay: number;
  onDone: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDone(badge.id), TOAST_MS + delay);
    return () => clearTimeout(timer);
  }, [badge.id, delay, onDone, paused]);

  return (
    <div
      className={styles.toast}
      style={{ animationDelay: `${delay}ms` }}
      // Hovering or focusing keeps it open long enough to read.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.icon} aria-hidden="true">
        {badge.icon || "🏅"}
      </span>
      <span className={styles.text}>
        <strong>Badge earned:</strong> {badge.name}!
      </span>
      <button
        type="button"
        className={styles.close}
        onClick={() => onDone(badge.id)}
        aria-label={`Dismiss ${badge.name}`}
      >
        ×
      </button>
    </div>
  );
}
