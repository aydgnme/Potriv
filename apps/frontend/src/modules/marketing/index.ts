/**
 * The public marketing surface.
 *
 * This module is a leaf: it depends on shared tokens and nothing else, and no
 * product module depends on it. That direction is deliberate — marketing copy
 * changes for reasons that have nothing to do with staffing, and the product
 * must never be recompiled by a headline.
 */
export { LandingPage } from "./components/LandingPage";
export { CREATE_WORKSPACE_HREF, SIGN_IN_HREF } from "./landingContent";
