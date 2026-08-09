/**
 * The projects module's public boundary. Server loading stays under `server/`
 * and is imported directly by the route, so backend transport never reaches a
 * client bundle.
 */
export { ProjectsPage } from "./components/ProjectsPage";
export type { ProjectsPageProps } from "./components/ProjectsPage";
