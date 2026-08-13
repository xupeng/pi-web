// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "../api";
import { SessionList } from "./SessionList";

function session(id: string): SessionInfo {
  return { id, cwd: "/srv", path: `/srv/s/${id}.jsonl`, created: "2026-07-01T00:00:00.000Z", modified: "2026-07-01T00:00:00.000Z", messageCount: 1, firstMessage: "" };
}

afterEach(() => {
  document.body.replaceChildren();
});

function mount(overrides: Partial<SessionList> = {}): SessionList {
  const list = new SessionList();
  list.sessions = [session("s1")];
  list.collapsible = true;
  Object.assign(list, overrides);
  document.body.append(list);
  return list;
}

describe("session-list sort control", () => {
  it("renders a sort menu in the heading and reports changes", async () => {
    const onSortModeChange = vi.fn();
    const list = mount({
      sortMode: "activity",
      sortOptions: [{ value: "activity", label: "Latest activity" }, { value: "created", label: "Created" }],
      onSortModeChange,
    });
    await list.updateComplete;

    const sortControl = list.shadowRoot?.querySelector<HTMLElement>("sort-menu-button");
    expect(sortControl).not.toBeNull();
    const trigger = sortControl?.shadowRoot?.querySelector<HTMLButtonElement>(".sort-menu-toggle");
    expect(trigger?.getAttribute("aria-label")).toBe("Sort sessions");
    trigger?.click();
    await list.updateComplete;

    const items = sortControl?.shadowRoot?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    expect(items).toHaveLength(2);
    items?.[1]?.click();
    await list.updateComplete;
    expect(onSortModeChange).toHaveBeenCalledWith("created");
  });

  it("keeps section collapse working with a sort control present", async () => {
    const onToggleCollapsed = vi.fn();
    const list = mount({
      sortOptions: [{ value: "activity", label: "Latest activity" }],
      onToggleCollapsed,
    });
    await list.updateComplete;

    list.shadowRoot?.querySelector<HTMLButtonElement>(".section-toggle")?.click();
    await list.updateComplete;
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
    expect(list.shadowRoot?.querySelector("sort-menu-button")).not.toBeNull();
  });

  it("hides the sort control when no options are offered", async () => {
    const list = mount();
    await list.updateComplete;
    expect(list.shadowRoot?.querySelector("sort-menu-button")).toBeNull();
  });
});
