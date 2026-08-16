import type { ReactNode } from "react";

import styles from "./auth.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.shell}>
      <div className={styles.card}>{children}</div>
    </main>
  );
}
