/**
 * Product chrome.
 *
 * Authenticated routes will render inside AppShell once FE-02 supplies a session;
 * the shell takes its data as props and never fetches, so it cannot be wired up
 * before then. Until it is, this group provides the product surface that the
 * unauthenticated screens (login) sit on.
 */
export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return children;
}
