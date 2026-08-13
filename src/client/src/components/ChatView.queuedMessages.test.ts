// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import type { SessionStatus } from "../api";
import { FormattedText } from "./FormattedText";
import { ChatView } from "./ChatView";

afterEach(() => {
  document.body.replaceChildren();
});

describe("ChatView queued messages", () => {
  it("renders queued items as an ordered list without a separator before the first item", async () => {
    const view = await mountView();
    view.status = queuedStatus([
      { kind: "steer", text: "First queued message" },
      { kind: "followUp", text: "Second queued message" },
    ]);
    await view.updateComplete;

    const list = requiredElement(view.shadowRoot?.querySelector<HTMLOListElement>(".queued-message-list"), "queued message list");
    const items = [...list.querySelectorAll<HTMLLIElement>(".queued-message")];
    expect(items).toHaveLength(2);
    expect([...list.children]).toEqual(items);
    expect(items[0]?.querySelector(".queued-kind")?.textContent).toBe("Steer");
    expect(items[1]?.querySelector(".queued-kind")?.textContent).toBe("Follow-up");
    const formatted = [...view.shadowRoot?.querySelectorAll<FormattedText>("formatted-text") ?? []];
    expect(formatted).toHaveLength(2);
    await Promise.all(formatted.map(async (element) => { await element.updateComplete; }));
    expect(formatted[0]?.text).toBe("First queued message");
    expect(formatted[1]?.text).toBe("Second queued message");
  });

  it("re-pins queue changes only while already pinned to the bottom", async () => {
    const view = await mountView();
    let bottomScrolls = 0;
    if (!Reflect.set(view, "scrollToBottom", () => { bottomScrolls += 1; })) throw new Error("Could not observe ChatView.scrollToBottom");

    if (!Reflect.set(view, "pinnedToBottom", true)) throw new Error("Could not set ChatView.pinnedToBottom");
    view.status = queuedStatus([{ kind: "steer", text: "Server queued" }]);
    await view.updateComplete;
    view.clientQueuedMessages = [{ kind: "followUp", text: "Queued before start" }];
    await view.updateComplete;

    if (!Reflect.set(view, "pinnedToBottom", false)) throw new Error("Could not set ChatView.pinnedToBottom");
    view.status = queuedStatus([
      { kind: "steer", text: "Server queued" },
      { kind: "followUp", text: "Another queued" },
    ]);
    await view.updateComplete;
    view.clientQueuedMessages = [];
    await view.updateComplete;

    expect(bottomScrolls).toBe(2);
  });

  it("ignores unchanged queue snapshots and session switches", async () => {
    const view = await mountView();
    let bottomScrolls = 0;
    if (!Reflect.set(view, "scrollToBottom", () => { bottomScrolls += 1; })) throw new Error("Could not observe ChatView.scrollToBottom");

    if (!Reflect.set(view, "pinnedToBottom", true)) throw new Error("Could not set ChatView.pinnedToBottom");
    const queuedMessages = [{ kind: "steer", text: "Server queued" }] as const;
    view.status = queuedStatus([...queuedMessages]);
    await view.updateComplete;

    view.status = { ...queuedStatus([...queuedMessages]), cost: 1 };
    await view.updateComplete;

    view.sessionId = "session-2";
    view.status = {
      ...queuedStatus([
        ...queuedMessages,
        { kind: "followUp", text: "Queued in the next session" },
      ]),
      sessionId: "session-2",
    };
    await view.updateComplete;

    expect(bottomScrolls).toBe(1);
  });
});

async function mountView(): Promise<ChatView> {
  const view = new ChatView();
  view.sessionId = "session-1";
  document.body.append(view);
  await view.updateComplete;
  return view;
}

function requiredElement<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function queuedStatus(queuedMessages: NonNullable<SessionStatus["queuedMessages"]>): SessionStatus {
  return {
    sessionId: "session-1",
    isStreaming: true,
    isCompacting: false,
    isBashRunning: false,
    pendingMessageCount: queuedMessages.length,
    queuedMessages,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
  };
}
