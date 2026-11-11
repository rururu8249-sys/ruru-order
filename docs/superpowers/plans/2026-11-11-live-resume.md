# Restore live playback after switching away

Use systematic-debugging and verification-before-completion. This is the requested playback bug fix; product introduction bookmarks remain a design proposal.

Confirmed gap: LiveWatchView has no lifecycle return handler. Its player keeps an old position after browser background suspension. Existing backToLive correctly seeks actual seekableEnd, but only runs on a click.

- Add a tested lifecycle controller and hook: remember whether playback was live before leaving, request fresh player telemetry on return, seek fresh seekableEnd and play without changing mute/reloading.
- Preserve explicit rewind/pause; cancel pending recovery if the user interacts; wait for actual live-head/playing confirmation. Bound retries and show a tap-to-resume fallback when autoplay is blocked.
- Handle visibilitychange, desktop app blur/focus (exclude iframe focus), BFCache pagehide/pageshow; cleanup/reset per video/player.
- Test delayed/partial/stale telemetry, live/rewind/pause/VOD, repeated lifecycle events, bounded retries and actual LiveWatch integration. No operational chat/widget writes.
- Run tsc/build BANKDA2 and relevant seek/sound tests, independent review, push, verify Vercel, record CLAUDE progress.
