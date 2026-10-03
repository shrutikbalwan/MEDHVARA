"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./AppNav.module.css";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/learn", label: "Learn" },
  { href: "/chat", label: "Chat" },
  { href: "/projects", label: "Projects" },
] as const;

/**
 * Main navigation for signed-in pages. A client component only so it can read
 * the current path and mark the active section — /learn/abc and /projects/new
 * light up their parent link too.
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Main">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.link} ${active ? styles.active : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
