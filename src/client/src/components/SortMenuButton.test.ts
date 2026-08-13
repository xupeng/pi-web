// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { SortMenuButton, type SortMenuOption } from "./SortMenuButton";

const OPTIONS: SortMenuOption[] = [
  { value: "activity", label: "Latest activity" },
  { value: "name", label: "Name" },
];

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

function mount(overrides: Partial<SortMenuButton> = {}): SortMenuButton {
  const button = new SortMenuButton();
  button.label = "Sort projects";
  button.options = OPTIONS;
  button.selected = "activity";
  button.onSelect = vi.fn();
  Object.assign(button, overrides);
  document.body.append(button);
  return button;
}

describe("sort-menu-button", () => {
  it("shows the current sort mode on the trigger", async () => {
    const button = mount({ selected: "name" });
    await button.updateComplete;
    const trigger = button.shadowRoot?.querySelector<HTMLButtonElement>(".sort-menu-toggle");
    expect(trigger?.textContent).toContain("Name");
    expect(trigger?.getAttribute("aria-label")).toBe("Sort projects");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the menu on trigger click with menuitemradio options", async () => {
    const button = mount();
    await button.updateComplete;
    button.shadowRoot?.querySelector<HTMLButtonElement>(".sort-menu-toggle")?.click();
    await button.updateComplete;

    const menu = button.shadowRoot?.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    const items = button.shadowRoot?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    expect(items).toHaveLength(2);
    expect(items?.[0]?.getAttribute("aria-checked")).toBe("true");
    expect(items?.[1]?.getAttribute("aria-checked")).toBe("false");
  });

  it("selecting a new mode calls onSelect and closes the menu", async () => {
    const onSelect = vi.fn();
    const button = mount({ onSelect });
    await button.updateComplete;
    button.shadowRoot?.querySelector<HTMLButtonElement>(".sort-menu-toggle")?.click();
    await button.updateComplete;

    const items = button.shadowRoot?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    items?.[1]?.click();
    await button.updateComplete;

    expect(onSelect).toHaveBeenCalledWith("name");
    expect(button.shadowRoot?.querySelector('[role="menu"]')).toBeNull();
  });

  it("selecting the current mode only closes the menu", async () => {
    const onSelect = vi.fn();
    const button = mount({ onSelect });
    await button.updateComplete;
    button.shadowRoot?.querySelector<HTMLButtonElement>(".sort-menu-toggle")?.click();
    await button.updateComplete;
    button.shadowRoot?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[0]?.click();
    await button.updateComplete;
    expect(onSelect).not.toHaveBeenCalled();
    expect(button.shadowRoot?.querySelector('[role="menu"]')).toBeNull();
  });

  it("closes on outside clicks and Escape", async () => {
    const button = mount();
    await button.updateComplete;
    button.shadowRoot?.querySelector<HTMLButtonElement>(".sort-menu-toggle")?.click();
    await button.updateComplete;
    expect(button.shadowRoot?.querySelector('[role="menu"]')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await button.updateComplete;
    expect(button.shadowRoot?.querySelector('[role="menu"]')).toBeNull();

    button.shadowRoot?.querySelector<HTMLButtonElement>(".sort-menu-toggle")?.click();
    await button.updateComplete;
    button.shadowRoot?.querySelector<HTMLButtonElement>(".sort-menu-toggle")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await button.updateComplete;
    expect(button.shadowRoot?.querySelector('[role="menu"]')).toBeNull();
  });
});
