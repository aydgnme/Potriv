import type { ReactNode } from "react";

import styles from "../styles/landing.module.css";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingHeader } from "./MarketingHeader";

/**
 * The frame every public marketing page sits in.
 *
 * Extracted when the four sections became four routes: five pages copying a
 * header and footer is five places for them to diverge, and the header is the
 * one component on these pages that is not server-rendered. One shell means one
 * `main#main` for the skip link to land on, and one nav source of truth.
 */
export function MarketingShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.page}>
      <MarketingHeader />
      <main id="main">{children}</main>
      <MarketingFooter />
    </div>
  );
}
