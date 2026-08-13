export const PWA_DISPLAY_MODE_QUERIES = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)",
] as const;

export interface DisplayModeMediaState {
  readonly matches: boolean;
}

export function createPwaDisplayModeMedia(): MediaQueryList[] {
  if (typeof window === "undefined" || !("matchMedia" in window)) return [];
  return PWA_DISPLAY_MODE_QUERIES.map((query) => window.matchMedia(query));
}

export function detectPwaDisplayMode(media: readonly DisplayModeMediaState[], navigatorObject = currentNavigator()): boolean {
  return media.some((query) => query.matches) || isIosStandalonePwa(navigatorObject);
}

/**
 * Configures the viewport for iOS standalone PWAs, where WebKit's
 * env(safe-area-inset-*) is unreliable (bugs 313800 / 317153): drops
 * viewport-fit=cover so iOS applies its default top safe-area inset, and marks
 * the document so the app pads the bottom with a fixed 34px fallback.
 * Regular WKWebView shells and Safari tabs keep viewport-fit=cover and use the
 * real env() values. Safe to call on every launch; it is a no-op elsewhere.
 */
export function configureIosSafeAreaViewport(): void {
  if (typeof document === "undefined") return;
  if (!isIosStandalonePwa(currentNavigator())) return;
  document.querySelector('meta[name="viewport"]')?.setAttribute("content", "width=device-width, initial-scale=1.0");
  document.body.classList.add("ios-pwa-no-cover");
}

function currentNavigator(): object | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}

function isIosStandalonePwa(navigatorObject: object | undefined): boolean {
  return navigatorObject !== undefined && "standalone" in navigatorObject && navigatorObject.standalone === true;
}
