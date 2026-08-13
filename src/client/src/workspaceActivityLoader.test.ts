import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "./api";
import { latestSessionModified, WorkspaceActivityLoader, type WorkspaceSessionLister } from "./workspaceActivityLoader";

function session(id: string, modified: string): SessionInfo {
  return { id, cwd: "/srv", path: `/srv/s/${id}.jsonl`, created: modified, modified, messageCount: 1, firstMessage: "" };
}

class FakeLister implements WorkspaceSessionLister {
  calls: { cwd: string; machineId?: string }[] = [];
  constructor(private readonly byCwd: Record<string, SessionInfo[]>) {}
  sessions(cwd: string, machineId = "local"): Promise<SessionInfo[]> {
    this.calls.push({ cwd, machineId });
    return Promise.resolve(this.byCwd[cwd] ?? []);
  }
}

describe("latestSessionModified", () => {
  it("returns the newest parseable modified time", () => {
    const sessions = [session("a", "2026-07-01T00:00:00.000Z"), session("b", "2026-07-03T00:00:00.000Z"), session("c", "2026-07-02T00:00:00.000Z")];
    expect(latestSessionModified(sessions)).toBe("2026-07-03T00:00:00.000Z");
  });

  it("skips unparseable modified times", () => {
    const sessions = [{ ...session("a", "not-a-date") }, session("b", "2026-07-02T00:00:00.000Z")];
    expect(latestSessionModified(sessions)).toBe("2026-07-02T00:00:00.000Z");
  });

  it("returns undefined for no sessions or no parseable times", () => {
    expect(latestSessionModified([])).toBeUndefined();
    expect(latestSessionModified([session("a", "not-a-date")])).toBeUndefined();
  });
});

describe("WorkspaceActivityLoader", () => {
  let now: number;
  let lister: FakeLister;
  let loader: WorkspaceActivityLoader;
  let changed: { machineId: string; cwd: string }[];
  let errors: { machineId: string; cwd: string; error: unknown }[];

  beforeEach(() => {
    now = 1_000_000;
    lister = new FakeLister({
      "/srv/project-a": [session("a1", "2026-07-02T00:00:00.000Z"), session("a2", "2026-07-03T00:00:00.000Z")],
      "/srv/project-b": [session("b1", "2026-07-01T00:00:00.000Z")],
      "/srv/project-c": [],
    });
    changed = [];
    errors = [];
    loader = new WorkspaceActivityLoader(lister, {
      ttlMs: 60_000,
      now: () => now,
      onChanged: (machineId, cwd) => { changed.push({ machineId, cwd }); },
      onBackgroundError: (machineId, cwd, error) => { errors.push({ machineId, cwd, error }); },
    });
  });

  it("loads activity for requested cwds and exposes it in the snapshot", async () => {
    loader.ensure("local", ["/srv/project-a", "/srv/project-b"]);
    await vi.waitFor(() => {
      expect(loader.snapshot("local").has("/srv/project-a")).toBe(true);
      expect(loader.snapshot("local").has("/srv/project-b")).toBe(true);
    });
    expect(lister.calls.map((c) => c.cwd)).toEqual(["/srv/project-a", "/srv/project-b"]);
    expect(loader.snapshot("local").get("/srv/project-a")).toBe("2026-07-03T00:00:00.000Z");
    expect(loader.snapshot("local").get("/srv/project-b")).toBe("2026-07-01T00:00:00.000Z");
    expect(changed).toEqual([
      { machineId: "local", cwd: "/srv/project-a" },
      { machineId: "local", cwd: "/srv/project-b" },
    ]);
  });

  it("does not re-fetch fresh cwds within the TTL", async () => {
    loader.ensure("local", ["/srv/project-a"]);
    await vi.waitFor(() => {
      expect(loader.snapshot("local").has("/srv/project-a")).toBe(true);
    });
    loader.ensure("local", ["/srv/project-a"]);
    expect(lister.calls).toHaveLength(1);
  });

  it("refetches after the TTL expires", async () => {
    loader.ensure("local", ["/srv/project-a"]);
    await vi.waitFor(() => {
      expect(loader.snapshot("local").has("/srv/project-a")).toBe(true);
    });
    now += 61_000;
    loader.ensure("local", ["/srv/project-a"]);
    await vi.waitFor(() => {
      expect(lister.calls).toHaveLength(2);
    });
    expect(lister.calls).toHaveLength(2);
  });

  it("dedupes concurrent ensure calls for the same cwd", async () => {
    loader.ensure("local", ["/srv/project-a"]);
    loader.ensure("local", ["/srv/project-a"]);
    loader.ensure("local", ["/srv/project-a"]);
    await vi.waitFor(() => {
      expect(loader.snapshot("local").has("/srv/project-a")).toBe(true);
    });
    expect(lister.calls).toHaveLength(1);
  });

  it("skips cwds with no sessions without an entry", async () => {
    loader.ensure("local", ["/srv/project-c"]);
    await vi.waitFor(() => {
      expect(lister.calls.map((c) => c.cwd)).toContain("/srv/project-c");
    });
    expect(loader.snapshot("local").has("/srv/project-c")).toBe(false);
    expect(changed).toHaveLength(0);
  });

  it("reports per-cwd failures and keeps the cwd out of the snapshot", async () => {
    const failing: WorkspaceSessionLister = {
      sessions: () => Promise.reject(new Error("boom")),
    };
    const failingLoader = new WorkspaceActivityLoader(failing, {
      now: () => now,
      onBackgroundError: (machineId, cwd, error) => { errors.push({ machineId, cwd, error }); },
    });
    failingLoader.ensure("local", ["/srv/project-a"]);
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.machineId).toBe("local");
    expect(errors[0]?.cwd).toBe("/srv/project-a");
    expect(errors[0]?.error).toBeInstanceOf(Error);
    expect(failingLoader.snapshot("local").has("/srv/project-a")).toBe(false);
  });

  it("isolates activity per machine", async () => {
    loader.ensure("local", ["/srv/project-a"]);
    await vi.waitFor(() => {
      expect(loader.snapshot("local").has("/srv/project-a")).toBe(true);
    });
    expect(loader.snapshot("other").has("/srv/project-a")).toBe(false);
    expect(lister.calls[0]?.machineId).toBe("local");
  });

  it("clears a machine's entries on demand", async () => {
    loader.ensure("local", ["/srv/project-a"]);
    await vi.waitFor(() => {
      expect(loader.snapshot("local").has("/srv/project-a")).toBe(true);
    });
    loader.clear("local");
    expect(loader.snapshot("local").size).toBe(0);
    loader.ensure("local", ["/srv/project-a"]);
    await vi.waitFor(() => {
      expect(lister.calls).toHaveLength(2);
    });
    expect(lister.calls).toHaveLength(2);
  });
});
