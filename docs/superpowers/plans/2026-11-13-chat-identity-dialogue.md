# Chat identity and grounded dialogue implementation plan

Goal: private customer photos for verified moderators only, varied coherent notification identities with AI badges, 5,000 avatar assignment slots (duplicates allowed), current-card grounded Gemini dialogue.
Architecture: original photo stays in server-only chat rows; public projection replaces it with a stable opaque avatar index. Private authenticated endpoint overlays originals. 152 curated source images (named anime characters, Jang Won-young, BTS logos, Korean/foreign celebrities, flowers, scenery and animals) are locally cached and reused through 5,000 shuffled assignment slots. The rejected generated atlas is excluded. Notification identities are deterministic per saved message, shared across viewers. Dialogue uses current server card and exact broadcast catalog record before and after generation.
Authorization: user repeatedly requested direct implementation and production reflection; latest clarification permits playful nickname 품절임박 regardless of inventory. Notification body remains factual. Existing financial isolation/free AI budgets/manual locks remain.

- [x] Public projection and realtime privacy migration; authorized private photo overlay; test anonymous/spoofed access and stable identity.
- [x] Shared avatar renderer and event-specific notification palettes/names; preserve AI badge across customer/admin/chat-view; curated internet image catalog and 5,000 assignment slots.
- [x] Current-card dialogue scope, owner historical topics/aliases, no fabricated purchase histories; server final checks and stale-card tests.
- [x] Targeted regression, TypeScript/build, independent review, migration/deploy and production read-only verification.

Review focus: public GET/POST/realtime/REST leak paths; private response cache and logout clearing; parser idempotence; fake current-card metadata/model misclassification; alias collision and invented options; preserving payment isolation and automatic OFF/manual lease rules.

Latest owner corrections: re-entry updates all same-broadcast history through a public profile key; completed broadcasts freeze. Orders vary by room mood (0–5 across a ten-minute window is allowed), never fixed per-order intervals. Ordinary batches contain 1–3, busy 2–3, rare bursts 3–5, quiet periods 20–30 minutes and mandatory rest after bursts; 12 automatic forms/hour is a ceiling, not a target. Same-person repeat cooldown 8–60 minutes; 65% single-submit personas. Manual picker keeps last three shortcuts plus persistent sent-message use marker; clearing shortcuts never deletes the record; deleted orders can show successful submission snapshots.

Ruling: production tempo migration applied first on owner complaint to prevent continued overload; all remaining bundle changes wait for verification/deploy. Existing unasked pending journeys moved 8+ minutes out without cancelling published question promises.

Latest dialogue correction: short fragments and real contextual replies instead of mandatory full product reports; order greetings/first-order claims and current receipt acknowledgements (including 입완) require persisted matching state. Quality/delivery questions allowed only for current card, never invented assertions. User-provided live screenshots inform style only, never copied identities, prices or experiences. Review fixes verified by dialogue/conversation/crowd DB suites.

Final range correction supersedes all earlier 50/100 goals: ordinary 2–30, rare 42–50, gradual steps 2–4. Exact screenshot near-duplicate phrases now rejected across nicknames; latest non-bot context is used. Production shared UI/privacy endpoints verified; original profiles excluded from anonymous output.
