import type { Project, SessionInfo, Workspace } from "../api";
import { sessionsApi } from "../api/clients";
import type { AppState } from "../appState";
import {
  sortProjects,
  sortSessions,
  sortWorkspaces,
  type NavigationSortMode,
  type NavigationSortSection,
} from "../navigationSorting";
import {
  browserNavigationSortStorage,
  navigationSortPreference,
  writeStoredNavigationSortMode,
  type NavigationSortPreferencesStorage,
} from "../navigationSortPreferences";
import { WorkspaceActivityLoader, type WorkspaceSessionLister } from "../workspaceActivityLoader";
import { selectedMachineId, type GetState, type SetState } from "./types";

export interface NavigationSortControllerDependencies {
  /** Preference storage; defaults to the browser's localStorage. */
  storage?: NavigationSortPreferencesStorage | undefined;
  /** Session listing seam; defaults to the sessions API. */
  lister?: WorkspaceSessionLister;
  ttlMs?: number;
  now?: () => number;
  onBackgroundError?: (message: string, error: unknown) => void;
}

/**
 * Owns navigation list sorting: per-machine sort preferences (persisted to
 * localStorage), background session-activity loading for projects and
 * workspaces, and the sorted arrays handed to the navigation panel.
 */
export class NavigationSortController {
  private readonly storage: NavigationSortPreferencesStorage | undefined;
  private readonly loader: WorkspaceActivityLoader;
  private lastSyncedMachineId: string | undefined;

  constructor(
    private readonly getState: GetState,
    private readonly setState: SetState,
    deps: NavigationSortControllerDependencies = {},
  ) {
    this.storage = deps.storage ?? browserNavigationSortStorage();
    const onBackgroundError = deps.onBackgroundError;
    this.loader = new WorkspaceActivityLoader(deps.lister ?? sessionsApi, {
      ...(deps.ttlMs === undefined ? {} : { ttlMs: deps.ttlMs }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      onChanged: (machineId) => {
        // Only the machine currently on screen may rewrite the snapshot; a
        // stale fetch from a previous machine must not leak into its list.
        if (selectedMachineId(this.getState()) !== machineId) return;
        this.setState({ workspaceActivity: Object.fromEntries(this.loader.snapshot(machineId)) });
      },
      onBackgroundError: (machineId, cwd, error) => {
        onBackgroundError?.(`Failed to load session activity for ${cwd} on ${machineId}`, error);
      },
    });
    // Adopt this machine's stored preferences before the first paint so a
    // saved "name"/"created" choice never flashes the default order.
    this.setState({ navigationSortModes: this.readPreferences(selectedMachineId(this.getState())) });
  }

  /** Reconcile machine scope and refresh activity. Call on every state change. */
  sync(state: AppState): void {
    const machineId = selectedMachineId(state);
    if (machineId !== this.lastSyncedMachineId) {
      this.lastSyncedMachineId = machineId;
      this.loader.clear(machineId);
      this.setState({
        navigationSortModes: this.readPreferences(machineId),
        workspaceActivity: {},
      });
    }
    if (this.needsActivity(state)) {
      this.loader.ensure(machineId, requiredActivityCwds(state));
    }
  }

  /** Change one section's sort mode, persisting it for the current machine. */
  setSortMode(section: NavigationSortSection, mode: NavigationSortMode): void {
    if (this.getState().navigationSortModes[section] === mode) return;
    const machineId = selectedMachineId(this.getState());
    writeStoredNavigationSortMode(this.storage, machineId, section, mode);
    this.setState({ navigationSortModes: { ...this.getState().navigationSortModes, [section]: mode } });
    this.sync(this.getState());
  }

  sortedProjects(state: AppState): Project[] {
    return sortProjects(state.projects, state.navigationSortModes.projects, activityByProjectId(state));
  }

  sortedWorkspaces(state: AppState): Workspace[] {
    return sortWorkspaces(state.workspaces, state.navigationSortModes.workspaces, activityByWorkspaceId(state));
  }

  sortedSessions(state: AppState): SessionInfo[] {
    return sortSessions(state.sessions, state.navigationSortModes.sessions);
  }

  private readPreferences(machineId: string): AppState["navigationSortModes"] {
    return {
      projects: navigationSortPreference(this.storage, machineId, "projects"),
      workspaces: navigationSortPreference(this.storage, machineId, "workspaces"),
      sessions: navigationSortPreference(this.storage, machineId, "sessions"),
    };
  }

  private needsActivity(state: AppState): boolean {
    return state.navigationSortModes.projects === "activity" || state.navigationSortModes.workspaces === "activity";
  }
}

/** cwds whose sessions determine project/workspace activity ordering. */
function requiredActivityCwds(state: AppState): string[] {
  const cwds: string[] = [];
  for (const project of state.projects) {
    cwds.push(project.path);
    for (const workspace of state.workspacesByProjectId[project.id] ?? []) cwds.push(workspace.path);
  }
  return cwds;
}

/** Latest session activity per project id, aggregated over its cwds. */
function activityByProjectId(state: AppState): Map<string, string> {
  const activity = new Map<string, string>();
  for (const project of state.projects) {
    let latest: string | undefined;
    const cwds = [project.path, ...(state.workspacesByProjectId[project.id] ?? []).map((workspace) => workspace.path)];
    for (const cwd of cwds) {
      const modified = state.workspaceActivity[cwd];
      if (modified === undefined) continue;
      if (latest === undefined || Date.parse(modified) > Date.parse(latest)) latest = modified;
    }
    if (latest !== undefined) activity.set(project.id, latest);
  }
  return activity;
}

/** Latest session activity per workspace id. */
function activityByWorkspaceId(state: AppState): Map<string, string> {
  const activity = new Map<string, string>();
  for (const workspace of state.workspaces) {
    const modified = state.workspaceActivity[workspace.path];
    if (modified !== undefined) activity.set(workspace.id, modified);
  }
  return activity;
}
