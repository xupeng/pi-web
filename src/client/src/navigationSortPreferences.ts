import { DEFAULT_NAVIGATION_SORT_MODE, isNavigationSortMode, type NavigationSortMode, type NavigationSortModeBySection, type NavigationSortSection } from "./navigationSorting";

export const NAVIGATION_SORT_STORAGE_KEY_PREFIX = "pi-web:nav-sort";

/** Storage seam so preference tests do not need a browser. */
export interface NavigationSortPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function navigationSortStorageKey(machineId: string, section: NavigationSortSection): string {
  return `${NAVIGATION_SORT_STORAGE_KEY_PREFIX}:${machineId}:${section}`;
}

/** Read one section's stored preference; invalid or missing values return undefined. */
export function readStoredNavigationSortMode(
  storage: NavigationSortPreferencesStorage | undefined,
  machineId: string,
  section: NavigationSortSection,
): NavigationSortMode | undefined {
  if (storage === undefined) return undefined;
  try {
    const value = storage.getItem(navigationSortStorageKey(machineId, section));
    return isNavigationSortMode(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Persist one section's preference; storage failures are ignored (session-only effect). */
export function writeStoredNavigationSortMode(
  storage: NavigationSortPreferencesStorage | undefined,
  machineId: string,
  section: NavigationSortSection,
  mode: NavigationSortMode,
): void {
  if (storage === undefined) return;
  try {
    storage.setItem(navigationSortStorageKey(machineId, section), mode);
  } catch {
    // Storage quota or privacy-mode failures must not break sorting; the
    // choice still applies for this tab's lifetime.
  }
}

/** Storage bound to the browser, or undefined outside a browser. */
export function browserNavigationSortStorage(): NavigationSortPreferencesStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Narrow a validated mode to the modes its section may use. Values outside the section's set cannot occur after validation. */
function modeForSection(mode: NavigationSortMode, section: NavigationSortSection): NavigationSortMode {
  switch (section) {
    case "projects":
    case "workspaces":
      return mode === "created" ? DEFAULT_NAVIGATION_SORT_MODE : mode;
    case "sessions":
      return mode === "name" ? DEFAULT_NAVIGATION_SORT_MODE : mode;
  }
}

/** Effective mode for a section: stored preference or the activity default, narrowed to the section's modes. */
export function navigationSortPreference(
  storage: NavigationSortPreferencesStorage | undefined,
  machineId: string,
  section: "projects",
): NavigationSortModeBySection["projects"];
export function navigationSortPreference(
  storage: NavigationSortPreferencesStorage | undefined,
  machineId: string,
  section: "workspaces",
): NavigationSortModeBySection["workspaces"];
export function navigationSortPreference(
  storage: NavigationSortPreferencesStorage | undefined,
  machineId: string,
  section: "sessions",
): NavigationSortModeBySection["sessions"];
export function navigationSortPreference(
  storage: NavigationSortPreferencesStorage | undefined,
  machineId: string,
  section: NavigationSortSection,
): NavigationSortMode {
  return modeForSection(readStoredNavigationSortMode(storage, machineId, section) ?? DEFAULT_NAVIGATION_SORT_MODE, section);
}
