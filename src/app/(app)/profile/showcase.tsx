/**
 * Pieces shared by /profile (your own, private view) and /profile/[userId]
 * (the shareable view), so the two pages look the same where they overlap.
 */
import type { BadgeStatus } from "@/lib/badges";

import p from "./profile.module.css";

export function Avatar({ photoUrl, name }: { photoUrl: string | null; name: string | null }) {
  if (photoUrl) {
    /*
     * A plain <img> rather than next/image on purpose. The source is a signed
     * URL on your Supabase host: it expires, and next/image would additionally
     * require that host in `images.remotePatterns`, coupling build config to an
     * env value. The Next docs recommend `unoptimized` for images behind
     * authentication anyway, which is what this is.
     */
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" width={96} height={96} className={p.photo} />;
  }
  return (
    <div className={p.photoFallback} aria-hidden="true">
      {name?.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

export function Tags({ values }: { values: string[] }) {
  return (
    <ul className={p.tags}>
      {values.map((value) => (
        <li key={value} className={p.tag}>
          {value}
        </li>
      ))}
    </ul>
  );
}

export function StatsRow({ stats }: { stats: { label: string; value: number }[] }) {
  return (
    <dl className={p.stats}>
      {stats.map(({ label, value }) => (
        <div key={label} className={p.stat}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EarnedBadgeRow({ badges }: { badges: BadgeStatus[] }) {
  return (
    <ul className={p.badgeRow}>
      {badges.map((badge) => (
        <li key={badge.id} className={p.badge} title={badge.description}>
          <span className={p.badgeIcon} aria-hidden="true">
            {badge.icon || "🏅"}
          </span>
          <span className={p.badgeName}>{badge.name}</span>
        </li>
      ))}
    </ul>
  );
}
