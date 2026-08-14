---
"@jmfederico/pi-web": patch
---

Render pending image attachments as small thumbnails in the composer instead of decoding the full-size photo, avoiding browser-level page reloads on memory-constrained mobile browsers when large photos are attached. The original image data sent with the prompt is unchanged.
