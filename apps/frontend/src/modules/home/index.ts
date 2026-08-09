/**
 * The home module's public boundary. Server loading stays under `server/` and is
 * imported directly by the route, so backend transport never reaches a client
 * bundle.
 */
export { HomePage } from "./components/HomePage";
export type { HomePageProps } from "./components/HomePage";
