// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PWA_DISPLAY_MODE_QUERIES, configureIosSafeAreaViewport, detectPwaDisplayMode } from "./pwaDisplayMode";

describe("detectPwaDisplayMode", () => {
  it("detects installed app display modes from media query matches", () => {
    expect(detectPwaDisplayMode([{ matches: false }, { matches: true }], undefined)).toBe(true);
  });

  it("detects iOS standalone PWAs", () => {
    expect(detectPwaDisplayMode([], { standalone: true })).toBe(true);
  });

  it("does not detect a normal browser tab as a PWA", () => {
    expect(detectPwaDisplayMode([{ matches: false }], { standalone: false })).toBe(false);
  });

  it("checks the installed app display modes supported by the manifest", () => {
    expect(PWA_DISPLAY_MODE_QUERIES).toEqual([
      "(display-mode: standalone)",
      "(display-mode: fullscreen)",
      "(display-mode: minimal-ui)",
    ]);
  });
});

describe("configureIosSafeAreaViewport", () => {
  let viewportMeta: HTMLMetaElement | null;

  beforeEach(() => {
    viewportMeta = document.createElement("meta");
    viewportMeta.name = "viewport";
    viewportMeta.content = "width=device-width, initial-scale=1.0, viewport-fit=cover";
    document.head.append(viewportMeta);
    document.body.classList.remove("ios-pwa-no-cover");
  });

  afterEach(() => {
    viewportMeta?.remove();
    document.body.classList.remove("ios-pwa-no-cover");
    vi.unstubAllGlobals();
  });

  it("drops viewport-fit=cover and marks the document for iOS standalone PWAs", () => {
    vi.stubGlobal("navigator", { standalone: true });
    configureIosSafeAreaViewport();
    expect(viewportMeta?.content).toBe("width=device-width, initial-scale=1.0");
    expect(document.body.classList.contains("ios-pwa-no-cover")).toBe(true);
  });

  it("keeps the cover viewport in regular browser tabs and web views", () => {
    vi.stubGlobal("navigator", { standalone: false });
    configureIosSafeAreaViewport();
    expect(viewportMeta?.content).toContain("viewport-fit=cover");
    expect(document.body.classList.contains("ios-pwa-no-cover")).toBe(false);
  });
});
