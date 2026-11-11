# Voice source verification — diagnostic branch, not production activation

Scope: determine whether the existing Vercel plan can access the owner's YouTube
source without an RTMP receiver. No API calls, database writes, photo writes,
cookies, new subscriptions, production activation or key deployment.

Facts checked 2026-11-11:
- Existing Vercel Pro team ruru-order: subscription $20, infrastructure $11.52,
  included credits applied -$11.52, total $20; remaining credit $8.48.
- Last 12 hours function overview: error <0.1%, timeout 0%. These are not
  guarantees of spare compute capacity or future incremental cost.
- Vercel Daemons public beta supports continuous processes on all plans, but
  does NOT accept inbound HTTP/TCP. A PRISM RTMP stream cannot terminate there.
- Source tBZ_wBUQtRI is currently was_live, duration 18782 seconds. Existing paid
  speech comparison is complete (receipt in chat workspace), not a live input test.

Execution:
1. Add a bounded source probe with no credentials; validate format selection,
   source state, URL allowlist and error redaction. Red tests observed; 4 pass.
2. Run the same probe in a feature-branch Vercel PREVIEW build using the existing
   Git deployment integration. A build-network result is NOT runtime/daemon proof.
3. Inspect the actual result. Never infer continuous live capability from VOD.
4. Keep activation disabled until runtime source, live clock and cost safeguards
   are proven. Preserve first marks and cross-day photo deduplication already built.

Ruling: reuse checkout on isolated branch; leave unrelated untracked files alone.
Ruling: temporary buildCommand is for this diagnostic branch only; do not merge
it into production. Probe receives only PATH/LANG/VERCEL, not app/API credentials.
The pinned upstream yt-dlp wheel is downloaded from PyPI and checksum-verified.
The probe reads at most 32 KiB of media, runs at most 75 seconds, and never retries.
No artificial six-hour run or repeat paid transcription is justified at this stage.

Sources:
- https://vercel.com/docs/daemons
- https://vercel.com/docs/daemons/limits
- https://github.com/yt-dlp/yt-dlp/wiki/Extractors

Pending: runtime and live source validation; continuous worker; source/video time
calibration; phone alerts; real buffered photo capture. No completion claim.
