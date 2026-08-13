---
"@jmfederico/pi-web": patch
---

Adapt iOS safe areas entirely in the web app: ship `viewport-fit=cover` and let the root shell pad `env(safe-area-inset-*)` so status-bar and home-indicator areas always match the active theme background, size modals against the dynamic viewport with a `vh` fallback, and drop the cover viewport only for iOS standalone PWAs where WebKit's safe-area env() values are unreliable.
