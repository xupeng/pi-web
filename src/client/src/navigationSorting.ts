import type { Project, SessionInfo, Workspace } from "./api";

/** Sort modes offered by the navigation lists. Each section supports a subset. */
export type NavigationSortMode = "activity" | "name" | "created";

/** The three navigation sections that carry a sort control. */
export type NavigationSortSection = "projects" | "workspaces" | "sessions";

/** Sort modes a section may choose among. */
export interface NavigationSortModeBySection {
  projects: "activity" | "name";
  workspaces: "activity" | "name";
  sessions: "activity" | "created";
}

/** Per-section sort choice, stored per machine and used to order list render. */
export type NavigationSortModes = NavigationSortModeBySection;

export const DEFAULT_NAVIGATION_SORT_MODE: NavigationSortMode = "activity";

export const DEFAULT_NAVIGATION_SORT_MODES: NavigationSortModes = {
  projects: "activity",
  workspaces: "activity",
  sessions: "activity",
};

/** Sort modes a section may offer, in menu display order. */
export function navigationSortModesForSection(section: NavigationSortSection): readonly NavigationSortMode[] {
  switch (section) {
    case "projects":
    case "workspaces":
      return ["activity", "name"];
    case "sessions":
      return ["activity", "created"];
  }
}

/** User-facing label for a sort mode. */
export function navigationSortModeLabel(mode: NavigationSortMode): string {
  switch (mode) {
    case "activity":
      return "Latest activity";
    case "name":
      return "Name";
    case "created":
      return "Created";
  }
}

export function isNavigationSortMode(value: unknown): value is NavigationSortMode {
  return value === "activity" || value === "name" || value === "created";
}

/**
 * Compare two optional ISO timestamps: entries with a finite timestamp come
 * first, then newest first, then (both missing) equal. A missing or
 * unparseable timestamp is treated as "no activity".
 */
function compareActivityDesc(a: string | undefined, b: string | undefined): number {
  const aTime = a === undefined ? Number.NaN : Date.parse(a);
  const bTime = b === undefined ? Number.NaN : Date.parse(b);
  const aHas = Number.isFinite(aTime);
  const bHas = Number.isFinite(bTime);
  if (aHas && bHas) return bTime - aTime;
  if (aHas) return -1;
  if (bHas) return 1;
  return 0;
}

/**
 * Case-insensitive name compare. Names that differ only by case or accents
 * (equal under `sensitivity: "base"`) fall back to a deterministic codepoint
 * comparison instead of a locale-specific exact compare.
 */
function compareNameAsc(a: string, b: string): number {
  const folded = a.localeCompare(b, undefined, { sensitivity: "base" });
  if (folded !== 0) return folded;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Order projects for display. `activity` ranks projects with any known session
 * activity newest first, then projects without activity by name; `name` sorts
 * case-insensitively by name, tie-broken by path. Always deterministic.
 */
export function sortProjects(
  projects: readonly Project[],
  mode: NavigationSortMode,
  activityByProjectId: ReadonlyMap<string, string>,
): Project[] {
  const sorted = [...projects];
  if (mode === "name") {
    sorted.sort((a, b) => compareNameAsc(a.name, b.name) || a.path.localeCompare(b.path));
    return sorted;
  }
  sorted.sort((a, b) => {
    const byActivity = compareActivityDesc(activityByProjectId.get(a.id), activityByProjectId.get(b.id));
    return byActivity !== 0 ? byActivity : compareNameAsc(a.name, b.name);
  });
  return sorted;
}

/**
 * Order workspaces for display, mirroring {@link sortProjects} but keyed by
 * label; workspaces carry no creation timestamp, so activity-less workspaces
 * simply sort after active ones, by label.
 */
export function sortWorkspaces(
  workspaces: readonly Workspace[],
  mode: NavigationSortMode,
  activityByWorkspaceId: ReadonlyMap<string, string>,
): Workspace[] {
  const sorted = [...workspaces];
  if (mode === "name") {
    sorted.sort((a, b) => compareNameAsc(a.label, b.label) || a.path.localeCompare(b.path));
    return sorted;
  }
  sorted.sort((a, b) => {
    const byActivity = compareActivityDesc(activityByWorkspaceId.get(a.id), activityByWorkspaceId.get(b.id));
    return byActivity !== 0 ? byActivity : compareNameAsc(a.label, b.label);
  });
  return sorted;
}

/**
 * Order sessions for display. `activity` sorts by file mtime newest first
 * (matching the server's listing order); `created` sorts by creation time
 * newest first. Both are tie-broken by the other timestamp, then path, so the
 * result is deterministic. The order is applied to the whole session array
 * before the tree is built, so parent/child grouping is preserved.
 */
export function sortSessions(sessions: readonly SessionInfo[], mode: NavigationSortMode): SessionInfo[] {
  const sorted = [...sessions];
  sorted.sort((a, b) => {
    const primary = mode === "created"
      ? compareActivityDesc(a.created, b.created)
      : compareActivityDesc(a.modified, b.modified);
    if (primary !== 0) return primary;
    const secondary = mode === "created"
      ? compareActivityDesc(a.modified, b.modified)
      : compareActivityDesc(a.created, b.created);
    return secondary !== 0 ? secondary : a.path.localeCompare(b.path);
  });
  return sorted;
}
