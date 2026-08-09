/**
 * The staffing module's public boundary. Server loading and mutations stay under
 * `server/` and are imported directly by the route, so backend transport never
 * reaches a client bundle.
 */
export { TeamFinderScreen } from "./components/TeamFinderScreen";
export type { TeamFinderScreenProps } from "./components/TeamFinderScreen";
