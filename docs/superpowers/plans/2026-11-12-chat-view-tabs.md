# Chat viewer tabs and unread previews

**Goal:** Existing /chat-view opens YouTube only; site messages appear as compact translucent unread previews over its top edge. Opening Site clears previews and badge.
**Architecture:** Preserve existing feeds/auth/emoji rendering and mounted YouTube iframe. A local reducer tracks initial history, distinct new message IDs, edits/deletions, broadcast changes and reads. No new backend or messages sent.
**UI:** YouTube | Site tabs, red unread badge (99+ cap), latest two unread messages in blue translucent overlay (two gentle glow cycles per arrival; reduced-motion respected), +remaining count. One full-height panel at any aspect ratio, retaining independent font sizes and fullscreen.

- [x] Test unread initial history, event-before-history, duplicates/edits, hidden/private messages, snapshot recovery, read/reset.
- [x] Implement tabs and compact preview; ignore old split-layout/show preferences; preserve mounted iframe.
- [x] Test actual ChatViewClient with mocked feeds for tab switching and clearing; check 9:16/narrow/wide browser layouts.
- [ ] Build, deploy existing project and verify production assets/link.
