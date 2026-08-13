import { beforeEach, describe, expect, it } from "vitest";
import {
  navigationSortPreference,
  navigationSortStorageKey,
  readStoredNavigationSortMode,
  writeStoredNavigationSortMode,
  type NavigationSortPreferencesStorage,
} from "./navigationSortPreferences";

class MemoryStorage implements NavigationSortPreferencesStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  failWrites = false;
}

function throwingStorage(): NavigationSortPreferencesStorage {
  return {
    getItem: () => { throw new Error("storage unavailable"); },
    setItem: () => { throw new Error("storage unavailable"); },
  };
}

describe("navigationSortStorageKey", () => {
  it("scopes keys by machine and section", () => {
    expect(navigationSortStorageKey("local", "projects")).toBe("pi-web:nav-sort:local:projects");
    expect(navigationSortStorageKey("remote-1", "sessions")).toBe("pi-web:nav-sort:remote-1:sessions");
  });
});

describe("readStoredNavigationSortMode", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("reads a stored mode", () => {
    storage.setItem(navigationSortStorageKey("local", "projects"), "name");
    expect(readStoredNavigationSortMode(storage, "local", "projects")).toBe("name");
  });

  it("returns undefined when nothing is stored", () => {
    expect(readStoredNavigationSortMode(storage, "local", "projects")).toBeUndefined();
  });

  it("rejects invalid stored values", () => {
    storage.setItem(navigationSortStorageKey("local", "projects"), "recent");
    expect(readStoredNavigationSortMode(storage, "local", "projects")).toBeUndefined();
  });

  it("isolates sections and machines", () => {
    storage.setItem(navigationSortStorageKey("local", "projects"), "name");
    expect(readStoredNavigationSortMode(storage, "local", "workspaces")).toBeUndefined();
    expect(readStoredNavigationSortMode(storage, "other", "projects")).toBeUndefined();
  });

  it("returns undefined when storage throws", () => {
    expect(readStoredNavigationSortMode(throwingStorage(), "local", "projects")).toBeUndefined();
  });
});

describe("writeStoredNavigationSortMode", () => {
  it("persists a mode", () => {
    const storage = new MemoryStorage();
    writeStoredNavigationSortMode(storage, "local", "sessions", "created");
    expect(storage.getItem(navigationSortStorageKey("local", "sessions"))).toBe("created");
  });

  it("ignores storage failures", () => {
    expect(() => { writeStoredNavigationSortMode(throwingStorage(), "local", "projects", "name"); }).not.toThrow();
  });
});

describe("navigationSortPreference", () => {
  it("falls back to the activity default", () => {
    expect(navigationSortPreference(undefined, "local", "projects")).toBe("activity");
    expect(navigationSortPreference(new MemoryStorage(), "local", "projects")).toBe("activity");
  });

  it("prefers a stored mode over the default", () => {
    const storage = new MemoryStorage();
    writeStoredNavigationSortMode(storage, "local", "workspaces", "name");
    expect(navigationSortPreference(storage, "local", "workspaces")).toBe("name");
  });
});
