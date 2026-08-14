import { describe, expect, it } from "vitest";
import type { SessionActivity, SessionStatus } from "./api";
import { chatActivityPresentation } from "./chatActivity";

function activity(phase: SessionActivity["phase"], label: string, detail?: string): SessionActivity {
  return {
    sessionId: "session-1",
    phase,
    label,
    ...(detail === undefined ? {} : { detail }),
    at: "2026-08-14T00:00:00.000Z",
  };
}

function status(partial: Partial<SessionStatus>): SessionStatus {
  return {
    sessionId: "session-1",
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    pendingMessageCount: 0,
    queuedMessages: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    ...partial,
  };
}

describe("chatActivityPresentation", () => {
  it("reports an active sending status while a prompt is being sent", () => {
    expect(chatActivityPresentation(undefined, status({}), true)).toEqual({ text: "Sending your message…", active: true });
  });

  it("reports working states from status with an active emphasis", () => {
    expect(chatActivityPresentation(undefined, status({ isCompacting: true }), false)).toEqual({ text: "compacting", active: true });
    expect(chatActivityPresentation(undefined, status({ isBashRunning: true }), false)).toEqual({ text: "bash", active: true });
    expect(chatActivityPresentation(undefined, status({ isStreaming: true }), false)).toEqual({ text: "running", active: true });
    expect(chatActivityPresentation(undefined, status({ pendingMessageCount: 2 }), false)).toEqual({ text: "queued", active: true });
  });

  it("prefers the active activity label over the derived status word", () => {
    expect(chatActivityPresentation(activity("active", "turn start"), status({ isStreaming: true }), false)).toEqual({ text: "turn start", active: true });
    expect(chatActivityPresentation(activity("active", "running bash", "ls -la"), status({ isBashRunning: true }), false)).toEqual({ text: "running bash: ls -la", active: true });
  });

  it("keeps the derived status word when the last activity is stale (idle phase)", () => {
    expect(chatActivityPresentation(activity("idle", "model: claude-x"), status({ isStreaming: true }), false)).toEqual({ text: "running", active: true });
  });

  it("shows idle with the last activity label when the session is idle", () => {
    expect(chatActivityPresentation(activity("idle", "compaction complete"), status({}), false)).toEqual({ text: "compaction complete", active: false });
    expect(chatActivityPresentation(undefined, status({}), false)).toEqual({ text: "idle", active: false });
  });

  it("shows the activity label without status and keeps error emphasis", () => {
    expect(chatActivityPresentation(activity("error", "bash failed", "boom"), undefined, false)).toEqual({ text: "bash failed: boom", active: true });
    expect(chatActivityPresentation(activity("idle", "model: claude-x"), undefined, false)).toEqual({ text: "model: claude-x", active: false });
  });

  it("hides the status entirely only when nothing is known yet", () => {
    expect(chatActivityPresentation(undefined, undefined, false)).toBeUndefined();
  });
});
