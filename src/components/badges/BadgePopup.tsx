"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { loadEarnedBadges } from "@/lib/supabase/badge-actions";
import { BADGES_PARAM, type Badge } from "@/types/badge";

import styles from "./BadgePopup.module.css";

/**
 * Shows "Badge earned!" for the ids in ?badges=… on any signed-in page, then
 * removes the parameter so a refresh or a shared link does not replay it.
 *
 * Every award flow ends by putting the new ids in the URL — either by
 * redirecting there (project create, profile save) or by replacing the current
 * URL (quiz, project edit) — so this one component covers them all.
 */
export function BadgePopup() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [badges, setBadges] = useState<Badge[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  const param = searchParams.get(BADGES_PARAM);

  useEffect(() => {
    if (!param) return;
    let cancelled = false;

    void loadEarnedBadges(param.split(",")).then((found) => {
      if (cancelled) return;
      setBadges(found);
      // Drop the parameter without a navigation, keeping any others.
      const rest = new URLSearchParams(searchParams.toString());
      rest.delete(BADGES_PARAM);
      const query = rest.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });

    return () => {
      cancelled = true;
    };
  }, [param, pathname, router, searchParams]);

  useEffect(() => {
    if (badges.length > 0) closeRef.current?.focus();
  }, [badges]);

  if (badges.length === 0) return null;

  return (
    <div className={styles.backdrop} onClick={() => setBadges([])}>
      <div
        className={styles.popup}
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-popup-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && setBadges([])}
      >
        <p id="badge-popup-title" className={styles.title}>
          {badges.length === 1 ? "Badge earned!" : `${badges.length} badges earned!`}
        </p>
        <ul className={styles.list}>
          {badges.map((badge) => (
            <li key={badge.id} className={styles.badge}>
              <span className={styles.icon} aria-hidden="true">
                {badge.icon || "🏅"}
              </span>
              <span>
                <span className={styles.name}>{badge.name}</span>
                <span className={styles.description}>{badge.description}</span>
              </span>
            </li>
          ))}
        </ul>
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          onClick={() => setBadges([])}
        >
          Nice!
        </button>
      </div>
    </div>
  );
}
