# AI conversation restraint — 2026-11-21

Latest user requirement supersedes earlier encouragement of self-reflection: avoid fabricated shopping deliberation and disconnected monologues while retaining slider pacing, broadcast phases, current cards and verified daily order products.

## Evidence
Production message 6076 (09:30:38Z) says MX-133 requires prolonged deliberation. Director log at 09:30:26Z records firstReason=model-chose-silence, then focused generation and sent. Message 6069 contains corrupted product name 몽ㅋㅋㅋㅋ315. Normal generated text was processed by product aliases, laugh variation and persona mutation. Prompts explicitly requested hesitation and personal deliberation.

## Changes
Honor deliberate empty-speaker decisions without a second generation. Malformed/missing speaker remains distinguishable and may use the existing bounded recovery. Preserve generated wording instead of post-generation persona/alias mutation. Remove forced introspection, topic hopping and three-candidate quota from prompts, including shared topic/product context. Do not disable chat, change slider settings, invent customer data or relax financial/product/phase safeguards.

## Verification
Actual Director regression: silence makes one model call in live/paused/replay; concrete product questions can still reach transport with exact text; malformed recovery, customer replies, zero slider, current-card removal and ordered-product revalidation retained. Existing phase/slider SQL parity (303 cases), topic repetition, order data scope, TypeScript and build checked. Production natural-language quality requires postdeployment observation; passing mocked tests does not prove it.
