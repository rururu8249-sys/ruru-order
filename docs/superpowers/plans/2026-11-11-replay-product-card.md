# Replay product card

Approved behavior: prerecorded video cards follow stored intro start timestamps until the next timestamp, including seeking and pause. No inferred end detection or AI service. Keep compact existing UI and full catalog escape. Multiple products at the same timestamp form a group; hold the first card and let the panel show all. Last group stays until video ends; before first point, ended video, missing catalog or unknown recording position show no card. Live playback keeps existing controls; OFF hides both.

Implementation sequence:
1. Pure timeline selection using existing video-scoped catalog and canonical product identities; retain unavailable group boundaries. Tests: start/next/seek-back, equal start, stock unavailable, wrong video, unknown time.
2. Browser hook checks YouTube origin/source/video identity, listens to real time telemetry with no wall-clock simulation, resets on broadcast/video/reload, rejects stale catalog loads, refreshes existing cached endpoint. Test actual hook events, pause/end/live mode/OFF/races/cleanup.
3. Wire existing LiveWatchView card/panel to replay result on recordings; label 영상 속 상품; retain live behavior. Scoped regression suite, production build, independent whole-diff review, deploy and read-only browser verification.

Review focus: stale video data, first/last timestamps, tied products, unavailable product boundaries, partial YouTube packets, paused state, mode changes, OFF, filtered-panel stability, live/intro regression.

Verification ledger:
- Pure timeline and actual hook tests observed failing before implementation, then passed.
- Existing featured UI test covers replay override, unavailable segment hiding, and stable opened panel.
- Live seek, sound, intro player/navigation/catalog regression suites pass; TypeScript passes.
- Fresh independent review: no important actionable issues.
- Real YouTube browser verification using saved catalog: 590s -> PD-507, 684s -> PD-509, 954s -> PD-508; rewind 590s restores PD-507; 100s hides card. Temporary fixture removed before build. No production data writes.
- Recording catalog refresh uses existing cache at most once per minute while visible; no additional infrastructure.
