/**
 * The public marketing surface.
 *
 * This module is a leaf: it depends on shared tokens and nothing else, and no
 * product module depends on it. That direction is deliberate — marketing copy
 * changes for reasons that have nothing to do with staffing, and the product
 * must never be recompiled by a headline.
 *
 * One export per public route. The route files under `app/(product)` stay thin:
 * they own metadata and nothing else, and every page's presentation lives here.
 */
export { HomePage } from "./components/pages/HomePage";
export { ProductPage } from "./components/pages/ProductPage";
export { HowItWorksPage } from "./components/pages/HowItWorksPage";
export { ForTeamsPage } from "./components/pages/ForTeamsPage";
export { SecurityPage } from "./components/pages/SecurityPage";
export {
  CREATE_WORKSPACE_HREF,
  MARKETING_ROUTES,
  SIGN_IN_HREF,
  type MarketingRoute,
} from "./landingContent";
