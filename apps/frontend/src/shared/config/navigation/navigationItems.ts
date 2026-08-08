import type { LucideIcon } from "lucide-react";
import {
  Building2,
  FolderKanban,
  Home,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

import type { AccessRole } from "@/shared/types/accessRole";

export type NavigationItemId =
  | "home"
  | "projects"
  | "staffing"
  | "people"
  | "skills"
  | "organization";

export type NavigationItem = {
  readonly id: NavigationItemId;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
};

type NavigationDefinition = NavigationItem & {
  /**
   * Roles that reveal this item. Empty means every signed-in user sees it.
   * Membership is a union, never an intersection: holding more roles can only
   * add items.
   */
  readonly revealedBy: readonly AccessRole[];
};

/**
 * The single source of navigation truth. Order here is the order on screen, so
 * a new item is placed by editing this list rather than by touching the Sidebar.
 */
export const NAVIGATION_DEFINITIONS: readonly NavigationDefinition[] = [
  { id: "home", label: "Home", href: "/home", icon: Home, revealedBy: [] },
  { id: "projects", label: "Projects", href: "/projects", icon: FolderKanban, revealedBy: [] },
  {
    id: "staffing",
    label: "Staffing",
    href: "/staffing",
    icon: UsersRound,
    revealedBy: ["PROJECT_MANAGER", "DEPARTMENT_MANAGER"],
  },
  {
    id: "people",
    label: "People",
    href: "/people",
    icon: UserRound,
    revealedBy: ["DEPARTMENT_MANAGER", "ORGANIZATION_ADMIN"],
  },
  { id: "skills", label: "Skills", href: "/skills", icon: Sparkles, revealedBy: [] },
  {
    id: "organization",
    label: "Organization",
    href: "/organization",
    icon: Building2,
    revealedBy: ["ORGANIZATION_ADMIN"],
  },
] as const;
