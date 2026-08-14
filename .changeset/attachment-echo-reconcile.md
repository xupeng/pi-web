---
"@jmfederico/pi-web": patch
---

Reconcile the composer's echoed user message with the persisted history when
sending inline image attachments to a non-vision model: saving a large photo
delays the echo long enough that a history refresh can surface the persisted
message first, and the two near-identical user lines (relative vs absolute
@-path references) used to appear side by side. The echo is now marked and the
client replaces the persisted line instead of appending a duplicate.
