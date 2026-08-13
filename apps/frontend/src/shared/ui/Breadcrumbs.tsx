import Link from "next/link";

import styles from "./Breadcrumbs.module.css";

export type Crumb = {
  readonly label: string;
  readonly href: string;
};

export type BreadcrumbsProps = {
  /** Ancestors, outermost first. Never includes the current page. */
  readonly trail: readonly Crumb[];
  /** The current page, as a person would name it — never an identifier. */
  readonly current: string;
};

/**
 * Where this page sits in the product.
 *
 * The trail is the product's own hierarchy, not the history stack. Someone
 * arriving from a bookmark has no history to go back through, and a control
 * that quietly does nothing for them is worse than no control — so every
 * ancestor is a real route, resolved from the object being viewed.
 *
 * The current page is text rather than a link: it is where the reader already
 * is, and offering to navigate there is an empty promise. It carries
 * `aria-current="page"` so the position is announced rather than inferred from
 * being last.
 *
 * At phone width the full trail is replaced by its nearest ancestor as a plain
 * "Back to X" link. That is the same destination the trail would have offered,
 * stated in the space available, and the heading below it already names the
 * current page — so nothing is lost by not repeating it.
 */
export function Breadcrumbs({ trail, current }: BreadcrumbsProps) {
  const parent = trail.at(-1);

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
      <ol className={styles.trail}>
        {trail.map((crumb) => (
          <li key={crumb.href} className={styles.crumb}>
            <Link href={crumb.href}>{crumb.label}</Link>
          </li>
        ))}
        <li className={styles.crumb}>
          <span aria-current="page">{current}</span>
        </li>
      </ol>

      {parent ? (
        <p className={styles.compact}>
          <Link href={parent.href}>{`Back to ${parent.label}`}</Link>
        </p>
      ) : null}
    </nav>
  );
}
