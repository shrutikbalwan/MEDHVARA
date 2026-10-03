import type { BadgeStatus } from "@/lib/badges";

import styles from "./BadgeGrid.module.css";

/** Badges that exist in the catalogue but cannot be earned yet. */
const COMING_SOON = new Set(["streak_7"]);

/**
 * Every badge: earned ones in full colour with the date, unearned ones greyed
 * out with their description as the hint for how to earn them.
 */
export function BadgeGrid({ badges }: { badges: BadgeStatus[] }) {
  return (
    <ul className={styles.grid}>
      {badges.map((badge) => {
        const earned = badge.earned_at !== null;
        return (
          <li
            key={badge.id}
            className={`${styles.badge} ${earned ? styles.earned : styles.locked}`}
          >
            <span className={styles.icon} aria-hidden="true">
              {badge.icon || "🏅"}
            </span>
            <span className={styles.name}>{badge.name}</span>
            <span className={styles.hint}>
              <span className={styles.visuallyHidden}>
                {earned ? "Earned. " : "Not earned yet. "}
              </span>
              {badge.description}
            </span>
            {earned ? (
              badge.earned_at ? (
                <span className={styles.date}>
                  {new Date(badge.earned_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              ) : null
            ) : (
              <span className={styles.status} aria-hidden="true">
                {COMING_SOON.has(badge.id) ? "Coming soon" : "🔒 Locked"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
