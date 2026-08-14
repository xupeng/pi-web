---
"@jmfederico/pi-web": patch
---

Resolve "Save to .pi-web/attachments" folder references to absolute paths for the model, matching inline attachments, so file tools can read saved images regardless of the session working directory. The echoed user message keeps the compact relative references.
