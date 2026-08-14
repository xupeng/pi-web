---
"@jmfederico/pi-web": patch
---

Polish the chat transcript and prompt editor UI:

- constrain event-group prose width and collapse long system messages by default
- move the agent activity status from the floating chat dock into the left of the bottom status bar (the dock stays hidden via CSS for upstream sync)
- collapse the prompt editor to a single line when empty, growing to five lines; shrink the placeholder hint and input font to 14px; keep the attach button inside the editor on narrow screens; match the model selector button height to the adjacent icon buttons
- close the gap under the last message and unify the bottom spacing with the model selector row at 12px; remove the redundant divider line
- align the status bar, mobile context bar, conversation position meter, and the status bar's top divider with the transcript messages (same centered max width); give the transcript a symmetric scrollbar gutter so the message cards stay centered with the bars
