# Bidirectional chat-view alerts and system-message filtering

User-authorized scope: /chat-view only. YouTube default, source-labelled reciprocal unread overlays; hide automated cart/payment/card request messages, keep order/purchase thanks and customer questions. No changes to message posting, orders or old chat-order automation.

Confirmed steering: retain original YouTube iframe. Its own messages remain unchanged. Filter site viewer + both notice sources. Query YouTube ONLY while the Site tab is visible; cancel timers/request on YouTube tab, hidden document, unmount or broadcast/video change.

Design: official API is used only for reverse unread alerts with existing OAuth connection. Shared server-only cache per broadcast, compare-and-set lease, >=20s between Google reads (honor pollingIntervalMillis), 60s offline/error backoff, longer quota backoff. Viewer polls cached route; no additional server subscription. Initial history is not unread, per-source state resets on video/broadcast switch, moderation deletions removed. No raw token/cursor/channel identifiers in public responses.

- [x] Filter and YouTube normalization tests, including customer payment questions and preserved purchase thanks.
- [x] Private cache table + server reader/route, exact active broadcast video, lease and error tests.
- [x] Original YouTube UI retained, reciprocal notices/badges/read handling and component regression tests.
- [ ] Portrait/wide visual checks, production build, deploy and live endpoint verification (offline broadcast cannot prove live arrivals).
