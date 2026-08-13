import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommandOption } from "../api";
import { PiWebApp } from "./PiWebApp";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PiWebApp Select Theme dialog", () => {
  it("marks only the applied theme and pre-selects it when auto resolves through a pair", () => {
    const app = createApp({ themeId: "themes:pi-web-dark", auto: true }, { prefersLight: true });

    openThemeDialog(app);

    const dialog = themeDialog(app);
    expect(dialog?.selectedValue).toBe("theme:themes:pi-web-light");
    expect(dialog?.options[0]).toMatchObject({ value: "auto:off", label: "Auto ✓ on" });
    expect(themeLabels(dialog)).toEqual([
      "PI WEB Dark",
      "PI WEB Light ✓ current",
      "Absolutely",
      "PI WEB Classic",
    ]);
    for (const label of themeLabels(dialog)) {
      expect(label).not.toMatch(/\bselected\b/);
      expect(label).not.toMatch(/\bactive\b/);
    }
  });

  it("marks the stored theme when auto is off", () => {
    const app = createApp({ themeId: "themes:classic", auto: false }, { prefersLight: true });

    openThemeDialog(app);

    const dialog = themeDialog(app);
    expect(dialog?.selectedValue).toBe("theme:themes:classic");
    expect(dialog?.options[0]).toMatchObject({ value: "auto:on", label: "Auto off" });
    expect(themeLabels(dialog)).toContain("PI WEB Classic ✓ current");
    expect(themeLabels(dialog)).not.toContain("PI WEB Light ✓ current");
  });

  it("applies a picked theme exactly and turns the system follower off", () => {
    const app = createApp({ themeId: "themes:pi-web-dark", auto: true }, { prefersLight: true });

    pickTheme(app, "theme:themes:pi-web-dark");

    expect(themePreference(app)).toEqual({ themeId: "themes:pi-web-dark", auto: false });
    expect(activeThemeId(app)).toBe("themes:pi-web-dark");
    expect(themeDialog(app)).toBeUndefined();
  });

  it("applies a picked theme as-is even when the system preference would resolve elsewhere", () => {
    const app = createApp({ themeId: "themes:pi-web-dark", auto: false }, { prefersLight: true });

    pickTheme(app, "theme:themes:pi-web-light");

    expect(themePreference(app)).toEqual({ themeId: "themes:pi-web-light", auto: false });
    expect(activeThemeId(app)).toBe("themes:pi-web-light");
  });

  it("re-enables the system follower from the auto row without losing the selection", () => {
    const app = createApp({ themeId: "themes:pi-web-light", auto: false }, { prefersLight: false });

    pickTheme(app, "auto:on");

    expect(themePreference(app)).toEqual({ themeId: "themes:pi-web-light", auto: true });
    expect(activeThemeId(app)).toBe("themes:pi-web-dark");
  });

  it("turns the system follower off from the auto row while keeping the selected theme", () => {
    const app = createApp({ themeId: "themes:pi-web-dark", auto: true }, { prefersLight: true });

    pickTheme(app, "auto:off");

    expect(themePreference(app)).toEqual({ themeId: "themes:pi-web-dark", auto: false });
    expect(activeThemeId(app)).toBe("themes:pi-web-dark");
  });
});

interface ThemePreference {
  themeId: string;
  auto: boolean;
}

interface ThemeDialogState {
  title: string;
  options: CommandOption[];
  selectedValue?: string;
}

function createApp(preference: ThemePreference, system: { prefersLight: boolean }): PiWebApp {
  const storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  const matchMedia = (query: string) => ({
    matches: query.includes("prefers-color-scheme: light") ? system.prefersLight : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("window", {
    location: { search: "" },
    localStorage: storage,
    matchMedia,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    clearInterval: () => undefined,
    clearTimeout: () => undefined,
  });
  vi.stubGlobal("document", {
    documentElement: {
      dataset: {},
      style: { setProperty: () => undefined, removeProperty: () => undefined },
    },
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  const app = new PiWebApp();
  if (!Reflect.set(app, "themePreference", preference)) throw new Error("Could not set PiWebApp theme preference");
  return app;
}

function themePreference(app: PiWebApp): ThemePreference {
  const preference: unknown = Reflect.get(app, "themePreference");
  if (!isThemePreference(preference)) throw new Error("PiWebApp theme preference is unavailable");
  return preference;
}

function activeThemeId(app: PiWebApp): string {
  const themeId: unknown = Reflect.get(app, "activeThemeId");
  if (typeof themeId !== "string") throw new Error("PiWebApp active theme id is unavailable");
  return themeId;
}

function openThemeDialog(app: PiWebApp): void {
  const method: unknown = Reflect.get(app, "openThemeDialog");
  if (typeof method !== "function") throw new Error("PiWebApp.openThemeDialog is not callable");
  method.call(app);
}

function pickTheme(app: PiWebApp, value: string): void {
  const method: unknown = Reflect.get(app, "pickTheme");
  if (typeof method !== "function") throw new Error("PiWebApp.pickTheme is not callable");
  method.call(app, value);
}

function themeDialog(app: PiWebApp): ThemeDialogState | undefined {
  const state: unknown = Reflect.get(app, "state");
  if (typeof state !== "object" || state === null) throw new Error("PiWebApp state is unavailable");
  const dialog: unknown = Reflect.get(state, "themeDialog");
  if (dialog === undefined) return undefined;
  if (!isThemeDialogState(dialog)) throw new Error("PiWebApp theme dialog state is invalid");
  return dialog;
}

function themeLabels(dialog: ThemeDialogState | undefined): string[] {
  if (dialog === undefined) throw new Error("Select Theme dialog is unavailable");
  return dialog.options.slice(1).map((option) => option.label);
}

function isThemePreference(value: unknown): value is ThemePreference {
  if (typeof value !== "object" || value === null) return false;
  if (!("themeId" in value && "auto" in value)) return false;
  return typeof value.themeId === "string" && typeof value.auto === "boolean";
}

function isThemeDialogState(value: unknown): value is ThemeDialogState {
  if (typeof value !== "object" || value === null) return false;
  if (!("title" in value && "options" in value)) return false;
  return typeof value.title === "string" && Array.isArray(value.options);
}
