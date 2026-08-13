import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Machine, Project, SessionInfo, Workspace } from "../api";
import { initialAppState, type AppState } from "../appState";
import { navigationSortStorageKey, type NavigationSortPreferencesStorage } from "../navigationSortPreferences";
import type { WorkspaceSessionLister } from "../workspaceActivityLoader";
import { NavigationSortController } from "./navigationSortController";

function project(id: string, name: string, path = `/srv/${id}`): Project {
  return { id, name, path, createdAt: "2026-07-01T00:00:00.000Z" };
}

function workspace(id: string, label: string, path: string): Workspace {
  return { id, projectId: "p1", path, label, isMain: false, effectiveConfig: {} };
}

function session(id: string, modified: string): SessionInfo {
  return { id, cwd: "/srv/p1", path: `/srv/s/${id}.jsonl`, created: modified, modified, messageCount: 1, firstMessage: "" };
}

function machine(id: string): Machine {
  return { id, name: id, kind: "remote", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };
}

class MemoryStorage implements NavigationSortPreferencesStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeLister implements WorkspaceSessionLister {
  calls: string[] = [];
  constructor(private readonly byCwd: Record<string, SessionInfo[]>) {}
  sessions(cwd: string): Promise<SessionInfo[]> {
    this.calls.push(cwd);
    return Promise.resolve(this.byCwd[cwd] ?? []);
  }
}

function baseState(): AppState {
  return initialAppState();
}

describe("NavigationSortController", () => {
  let storage: MemoryStorage;
  let lister: FakeLister;
  let state: AppState;
  let patches: Partial<AppState>[];
  let controller: NavigationSortController;

  beforeEach(() => {
    storage = new MemoryStorage();
    lister = new FakeLister({
      "/srv/p1": [session("s1", "2026-07-02T00:00:00.000Z")],
      "/srv/p1/w1": [session("s2", "2026-07-03T00:00:00.000Z")],
      "/srv/p2": [],
    });
    state = baseState();
    state.projects = [project("p1", "Alpha", "/srv/p1"), project("p2", "Beta", "/srv/p2")];
    state.workspacesByProjectId = {
      p1: [workspace("w1", "main", "/srv/p1/w1")],
      p2: [],
    };
    patches = [];
    controller = new NavigationSortController(
      () => state,
      (patch) => {
        state = { ...state, ...patch };
        patches.push(patch);
      },
      { storage, lister },
    );
  });

  it("adopts stored preferences for the current machine at construction", () => {
    storage.setItem(navigationSortStorageKey("local", "projects"), "name");
    const adopted = new NavigationSortController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      { storage, lister },
    );
    expect(state.navigationSortModes.projects).toBe("name");
    expect(state.navigationSortModes.workspaces).toBe("activity");
    adopted.sync(state);
  });

  it("sync loads activity for every project and workspace cwd", async () => {
    controller.sync(state);
    await vi.waitFor(() => {
      expect(lister.calls).toEqual(["/srv/p1", "/srv/p1/w1", "/srv/p2"]);
    });
    expect(state.workspaceActivity["/srv/p1/w1"]).toBe("2026-07-03T00:00:00.000Z");
  });

  it("does not load activity when no section sorts by activity", () => {
    storage.setItem(navigationSortStorageKey("local", "projects"), "name");
    storage.setItem(navigationSortStorageKey("local", "workspaces"), "name");
    controller = new NavigationSortController(
      () => state,
      (patch) => { state = { ...state, ...patch }; },
      { storage, lister },
    );
    controller.sync(state);
    expect(lister.calls).toEqual([]);
  });

  it("switching machines clears activity and adopts that machine's preferences", () => {
    storage.setItem(navigationSortStorageKey("remote", "projects"), "name");
    state.selectedMachine = machine("remote");
    controller.sync(state);
    expect(state.workspaceActivity).toEqual({});
    expect(state.navigationSortModes.projects).toBe("name");
  });

  it("setSortMode persists the choice and triggers activity sync", () => {
    controller.setSortMode("projects", "name");
    expect(storage.getItem(navigationSortStorageKey("local", "projects"))).toBe("name");
    expect(state.navigationSortModes.projects).toBe("name");
    const callsAfterProjectsName = lister.calls.length;
    controller.setSortMode("workspaces", "name");
    expect(storage.getItem(navigationSortStorageKey("local", "workspaces"))).toBe("name");
    const callsAfterBothName = lister.calls.length;
    controller.sync(state);
    expect(lister.calls.length).toBe(callsAfterBothName);
    controller.setSortMode("projects", "activity");
    expect(state.navigationSortModes.projects).toBe("activity");
    // Activity for every cwd is already cached, so re-enabling activity order
    // must not trigger a refetch.
    expect(lister.calls.length).toBe(callsAfterProjectsName);
  });

  it("sortedProjects orders by activity newest first, then name", async () => {
    controller.sync(state);
    await vi.waitFor(() => {
      expect(state.workspaceActivity["/srv/p1/w1"]).toBeDefined();
    });
    expect(controller.sortedProjects(state).map((p) => p.id)).toEqual(["p1", "p2"]);
    controller.setSortMode("projects", "name");
    expect(controller.sortedProjects(state).map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("sortedProjects puts projects without sessions after active ones", async () => {
    controller.sync(state);
    await vi.waitFor(() => {
      expect(state.workspaceActivity["/srv/p1"]).toBeDefined();
    });
    // p2 has no sessions anywhere: it must sort after p1 in activity mode.
    expect(controller.sortedProjects(state).map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("sortedWorkspaces orders the selected project's workspaces", async () => {
    state.workspaces = state.workspacesByProjectId["p1"] ?? [];
    controller.sync(state);
    await vi.waitFor(() => {
      expect(state.workspaceActivity["/srv/p1/w1"]).toBeDefined();
    });
    expect(controller.sortedWorkspaces(state).map((w) => w.id)).toEqual(["w1"]);
  });

  it("sortedSessions delegates to the session sort", () => {
    state.sessions = [
      session("old", "2026-07-01T00:00:00.000Z"),
      session("new", "2026-07-03T00:00:00.000Z"),
    ];
    expect(controller.sortedSessions(state).map((s) => s.id)).toEqual(["new", "old"]);
    controller.setSortMode("sessions", "created");
    expect(controller.sortedSessions(state).map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("ignores activity callbacks from a machine that is no longer selected", async () => {
    controller.sync(state);
    await vi.waitFor(() => {
      expect(lister.calls.length).toBe(3);
    });
    const patchesBefore = patches.length;
    // Simulate a fetch resolving after the user switched machines.
    state.selectedMachine = machine("remote");
    controller.sync(state);
    expect(patches.length).toBeGreaterThan(patchesBefore);
    expect(state.workspaceActivity).toEqual({});
  });
});
