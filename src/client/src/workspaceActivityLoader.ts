import type { SessionInfo } from "./api";

/** Session listing seam, satisfied by `sessionsApi` and fakes in tests. */
export interface WorkspaceSessionLister {
  sessions(cwd: string, machineId?: string): Promise<SessionInfo[]>;
}

export interface WorkspaceActivityLoaderOptions {
  /** Freshness window for cached per-cwd activity. */
  ttlMs?: number;
  /** Clock seam for deterministic tests. */
  now?: () => number;
  /** Called after a cwd's activity is refreshed, with the machine that owns it. */
  onChanged?: (machineId: string, cwd: string) => void;
  /** Called when one cwd's session listing fails; the cwd is skipped, not retried this pass. */
  onBackgroundError?: (machineId: string, cwd: string, error: unknown) => void;
}

interface ActivityEntry {
  lastModified: string;
  loadedAt: number;
}

const DEFAULT_ACTIVITY_TTL_MS = 60_000;

/**
 * Latest session activity per working directory, derived from session file
 * mtimes. The loader fetches `GET /sessions?cwd=...` in the background for
 * cwds without fresh entries, dedupes concurrent fetches, and keeps entries
 * scoped per machine. A failed cwd is simply skipped so the caller can render
 * with whatever activity it already has.
 */
export class WorkspaceActivityLoader {
  private readonly lister: WorkspaceSessionLister;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly onChanged: ((machineId: string, cwd: string) => void) | undefined;
  private readonly onBackgroundError: ((machineId: string, cwd: string, error: unknown) => void) | undefined;
  private readonly byMachine = new Map<string, Map<string, ActivityEntry>>();
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(lister: WorkspaceSessionLister, options: WorkspaceActivityLoaderOptions = {}) {
    this.lister = lister;
    this.ttlMs = options.ttlMs ?? DEFAULT_ACTIVITY_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    this.onChanged = options.onChanged;
    this.onBackgroundError = options.onBackgroundError;
  }

  /** Start background refreshes for cwds without fresh activity. Never throws. */
  ensure(machineId: string, cwds: readonly string[]): void {
    for (const cwd of cwds) {
      if (this.hasFresh(machineId, cwd)) continue;
      this.load(machineId, cwd);
    }
  }

  /** Latest activity per cwd currently known for a machine. */
  snapshot(machineId: string): ReadonlyMap<string, string> {
    const machine = this.byMachine.get(machineId);
    if (machine === undefined) return EMPTY_SNAPSHOT;
    const entries = new Map<string, string>();
    for (const [cwd, entry] of machine) entries.set(cwd, entry.lastModified);
    return entries;
  }

  /** Drop every cached entry for a machine (used on machine switches). */
  clear(machineId: string): void {
    this.byMachine.delete(machineId);
  }

  private hasFresh(machineId: string, cwd: string): boolean {
    const entry = this.byMachine.get(machineId)?.get(cwd);
    return entry !== undefined && this.now() - entry.loadedAt < this.ttlMs;
  }

  private load(machineId: string, cwd: string): void {
    const key = `${machineId}\u0000${cwd}`;
    if (this.inflight.has(key)) return;
    const promise = this.fetch(machineId, cwd).finally(() => { this.inflight.delete(key); });
    this.inflight.set(key, promise);
  }

  private async fetch(machineId: string, cwd: string): Promise<void> {
    try {
      const sessions = await this.lister.sessions(cwd, machineId);
      const latest = latestSessionModified(sessions);
      if (latest !== undefined) {
        this.machineMap(machineId).set(cwd, { lastModified: latest, loadedAt: this.now() });
        this.onChanged?.(machineId, cwd);
      }
    } catch (error) {
      this.onBackgroundError?.(machineId, cwd, error);
    }
  }

  private machineMap(machineId: string): Map<string, ActivityEntry> {
    let machine = this.byMachine.get(machineId);
    if (machine === undefined) {
      machine = new Map();
      this.byMachine.set(machineId, machine);
    }
    return machine;
  }
}

const EMPTY_SNAPSHOT: ReadonlyMap<string, string> = new Map();

/** Newest session `modified` among the given sessions, or undefined when none parse. */
export function latestSessionModified(sessions: readonly SessionInfo[]): string | undefined {
  let latest: string | undefined;
  let latestTime = Number.NaN;
  for (const session of sessions) {
    const time = Date.parse(session.modified);
    if (!Number.isFinite(time)) continue;
    if (latest === undefined || time > latestTime) {
      latest = session.modified;
      latestTime = time;
    }
  }
  return latest;
}
