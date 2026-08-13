import { describe, expect, it } from "vitest";
import type { Project, SessionInfo, Workspace } from "./api";
import {
  DEFAULT_NAVIGATION_SORT_MODES,
  isNavigationSortMode,
  navigationSortModeLabel,
  navigationSortModesForSection,
  sortProjects,
  sortSessions,
  sortWorkspaces,
} from "./navigationSorting";

function project(id: string, name: string, path = `/srv/${id}`): Project {
  return { id, name, path, createdAt: "2026-07-01T00:00:00.000Z" };
}

function workspace(id: string, label: string, path = `/srv/${id}`): Workspace {
  return { id, projectId: "p", path, label, isMain: false, effectiveConfig: {} };
}

function session(id: string, created: string, modified: string, path = `/srv/s/${id}.jsonl`): SessionInfo {
  return { id, cwd: "/srv", path, created, modified, messageCount: 1, firstMessage: "" };
}

describe("navigationSortModesForSection", () => {
  it("offers activity and name for projects and workspaces", () => {
    expect(navigationSortModesForSection("projects")).toEqual(["activity", "name"]);
    expect(navigationSortModesForSection("workspaces")).toEqual(["activity", "name"]);
  });

  it("offers activity and created for sessions", () => {
    expect(navigationSortModesForSection("sessions")).toEqual(["activity", "created"]);
  });
});

describe("navigationSortModeLabel", () => {
  it("labels every mode", () => {
    expect(navigationSortModeLabel("activity")).toBe("Latest activity");
    expect(navigationSortModeLabel("name")).toBe("Name");
    expect(navigationSortModeLabel("created")).toBe("Created");
  });
});

describe("isNavigationSortMode", () => {
  it("accepts only known modes", () => {
    expect(isNavigationSortMode("activity")).toBe(true);
    expect(isNavigationSortMode("name")).toBe(true);
    expect(isNavigationSortMode("created")).toBe(true);
    expect(isNavigationSortMode("recent")).toBe(false);
    expect(isNavigationSortMode(undefined)).toBe(false);
  });
});

describe("DEFAULT_NAVIGATION_SORT_MODES", () => {
  it("defaults every section to activity", () => {
    expect(DEFAULT_NAVIGATION_SORT_MODES).toEqual({
      projects: "activity",
      workspaces: "activity",
      sessions: "activity",
    });
  });
});

describe("sortProjects", () => {
  it("sorts by activity newest first when mode is activity", () => {
    const projects = [project("a", "Alpha"), project("b", "Beta"), project("c", "Gamma")];
    const activity = new Map([["a", "2026-07-03T00:00:00.000Z"], ["c", "2026-07-02T00:00:00.000Z"]]);
    expect(sortProjects(projects, "activity", activity).map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts projects without activity after active ones, by name", () => {
    const projects = [project("z", "Zulu"), project("a", "Alpha"), project("m", "Mike")];
    const activity = new Map([["m", "2026-07-03T00:00:00.000Z"]]);
    expect(sortProjects(projects, "activity", activity).map((p) => p.id)).toEqual(["m", "a", "z"]);
  });

  it("breaks activity ties by name", () => {
    const projects = [project("b", "Beta"), project("a", "Alpha")];
    const activity = new Map([["a", "2026-07-03T00:00:00.000Z"], ["b", "2026-07-03T00:00:00.000Z"]]);
    expect(sortProjects(projects, "activity", activity).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("sorts by name case-insensitively, tie-broken by path", () => {
    const projects = [project("b", "Beta", "/srv/z"), project("c", "alpha", "/srv/a"), project("a", "Alpha", "/srv/b")];
    expect(sortProjects(projects, "name", new Map()).map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input array", () => {
    const projects = [project("b", "Beta"), project("a", "Alpha")];
    const snapshot = [...projects];
    sortProjects(projects, "name", new Map());
    expect(projects).toEqual(snapshot);
  });
});

describe("sortWorkspaces", () => {
  it("sorts by activity newest first when mode is activity", () => {
    const workspaces = [workspace("w1", "One"), workspace("w2", "Two"), workspace("w3", "Three")];
    const activity = new Map([["w2", "2026-07-03T00:00:00.000Z"], ["w1", "2026-07-01T00:00:00.000Z"]]);
    expect(sortWorkspaces(workspaces, "activity", activity).map((w) => w.id)).toEqual(["w2", "w1", "w3"]);
  });

  it("sorts by label case-insensitively when mode is name", () => {
    const workspaces = [workspace("w1", "beta"), workspace("w2", "Alpha"), workspace("w3", "alpha")];
    expect(sortWorkspaces(workspaces, "name", new Map()).map((w) => w.id)).toEqual(["w2", "w3", "w1"]);
  });

  it("does not mutate the input array", () => {
    const workspaces = [workspace("w2", "Two"), workspace("w1", "One")];
    const snapshot = [...workspaces];
    sortWorkspaces(workspaces, "activity", new Map());
    expect(workspaces).toEqual(snapshot);
  });
});

describe("sortSessions", () => {
  it("sorts by modified newest first when mode is activity", () => {
    const sessions = [
      session("s1", "2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"),
      session("s2", "2026-07-01T00:00:00.000Z", "2026-07-03T00:00:00.000Z"),
      session("s3", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
    ];
    expect(sortSessions(sessions, "activity").map((s) => s.id)).toEqual(["s2", "s1", "s3"]);
  });

  it("sorts by created newest first when mode is created", () => {
    const sessions = [
      session("s1", "2026-07-01T00:00:00.000Z", "2026-07-03T00:00:00.000Z"),
      session("s2", "2026-07-03T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
      session("s3", "2026-07-02T00:00:00.000Z", "2026-07-02T00:00:00.000Z"),
    ];
    expect(sortSessions(sessions, "created").map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("breaks activity ties by created then path", () => {
    const sessions = [
      session("s1", "2026-07-01T00:00:00.000Z", "2026-07-03T00:00:00.000Z", "/srv/z"),
      session("s2", "2026-07-02T00:00:00.000Z", "2026-07-03T00:00:00.000Z"),
    ];
    expect(sortSessions(sessions, "activity").map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("does not mutate the input array", () => {
    const sessions = [session("s2", "2026-07-02T00:00:00.000Z", "2026-07-02T00:00:00.000Z"), session("s1", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z")];
    const snapshot = [...sessions];
    sortSessions(sessions, "activity");
    expect(sessions).toEqual(snapshot);
  });
});
