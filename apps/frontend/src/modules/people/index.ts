/**
 * The people module's public boundary. Server loading and mutations stay under
 * `server/` and are imported directly by the routes, so backend transport never
 * reaches a client bundle.
 */
export { PeoplePage } from "./components/PeoplePage";
export type { PeoplePageProps } from "./components/PeoplePage";
export { PersonDetail } from "./components/PersonDetail";
export type { PersonDetailProps } from "./components/PersonDetail";
