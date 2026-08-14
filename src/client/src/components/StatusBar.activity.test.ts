// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import type { SessionActivity, SessionStatus } from "../api";
import { StatusBar } from "./StatusBar";

afterEach(() => {
  document.body.replaceChildren();
});

function status(partial: Partial<SessionStatus> = {}): SessionStatus {
  return {
    sessionId: "session-1",
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    pendingMessageCount: 0,
    queuedMessages: [],
    tokens: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, total: 30 },
    cost: 0,
    ...partial,
  };
}

function activity(phase: SessionActivity["phase"], label: string, detail?: string): SessionActivity {
  return {
    sessionId: "session-1",
    phase,
    label,
    ...(detail === undefined ? {} : { detail }),
    at: "2026-08-14T00:00:00.000Z",
  };
}

async function renderBar(overrides: { activity?: SessionActivity; sending?: boolean } = {}): Promise<StatusBar> {
  const bar = new StatusBar();
  bar.status = status();
  if (overrides.activity !== undefined) bar.activity = overrides.activity;
  if (overrides.sending !== undefined) bar.sending = overrides.sending;
  document.body.append(bar);
  await bar.updateComplete;
  return bar;
}

describe("StatusBar agent activity", () => {
  it("shows an active status with the live activity label and an emphasis class", async () => {
    const bar = await renderBar({ activity: activity("active", "turn start") });

    const status = bar.shadowRoot?.querySelector(".activity");
    expect(status?.querySelector(".activity-text")?.textContent).toBe("turn start");
    expect(status?.classList.contains("active")).toBe(true);
    expect(status?.querySelector(".dot")).not.toBeNull();
  });

  it("shows idle text for an idle session", async () => {
    const bar = await renderBar();

    const status = bar.shadowRoot?.querySelector(".activity");
    expect(status?.querySelector(".activity-text")?.textContent).toBe("idle");
    expect(status?.classList.contains("active")).toBe(false);
  });

  it("shows the sending message with an active emphasis", async () => {
    const bar = await renderBar({ sending: true });

    const status = bar.shadowRoot?.querySelector(".activity");
    expect(status?.querySelector(".activity-text")?.textContent).toBe("Sending your message…");
    expect(status?.classList.contains("active")).toBe(true);
  });

  it("keeps the token statistics rendered alongside the status", async () => {
    const bar = await renderBar({ activity: activity("active", "agent running") });

    expect(bar.shadowRoot?.textContent).toContain("↑10");
    expect(bar.shadowRoot?.textContent).toContain("↓20");
  });
});
