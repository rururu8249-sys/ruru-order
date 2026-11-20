# AI chat product context implementation plan

**Goal:** Fix confirmed catalog-semantic errors from production chat without disabling paused/replay product conversations.
**Architecture:** Preserve parent product name and detailed option fields in DialogueCard. Build bounded, explicit product facts for both prompts and apply a deterministic semantic guard after styling. Treat missing category as unknown; product_type=broadcast is a sales channel, not an item category.
**Spec:** User handoff 2026-11-20; CLAUDE.md option-question policy 2026-11-15; merged PRs #33–38 and #45.
**Execution:** Inline, following the user's authorized investigation → reproduction → correction → regression → deployment-state sequence.

## Constraints
- Production DB read-only. No customer, financial, order, settings or hidden-state mutations.
- Preserve main's 0% switch, admission, pacing, reply targeting, screen-clear memory, card rotation, state transitions and deliberate silence.
- Preserve genuine color/fit questions and replies; no global wine-word ban or global off-air ban.
- Existing assertions stay intact. Current workspace changes remain untouched.

## Tasks
- [x] Reproduce 5470/5494/5510 with exact text and product facts in a failing regression. Include ordinary wine-color preference, chocolate/olive colors, unknown category and actual beverages as controls.
- [x] Extend DialogueCard with parentName; derive bounded product facts without fabricating a garment subtype. Explicit color options and recognizable color tokens in a detail name remain separate sources.
- [x] Share product facts across compact/focused prompts; pass actual broadcast mode into focused path. Add semantic validation to the final quality gate used after styling.
- [x] Reproduce option-question gap 5478/5503; extend stockQuestionBlocked for intervening words and negative existence forms while preserving design/fit questions and the existing quality-gate distinction between questions and assertions.
- [x] Run new regression, existing V2–V7/farewell/realism/dialogue/controls/limits checks, typecheck and build guards. Inspect full diff.
- [x] Write time-ordered evidence review with classification, counts, normal cases and limitations; verify remote/deployment state separately from local tests.

## Review focus
- No category column: clothing sizes are evidence, not proof of a specific coat/dress/material.
- Literal wine color is allowed; beverage predicates require food/drink evidence. No image-derived claims.
- A human's unrelated food conversation remains a valid reply even with a clothing card.
- Existing multiple-color choices are not replaced by colors inferred from a name.
- Empty/unrecognized options remain unknown; no absence claim is introduced.

Deployment status: local implementation/tests/build prepared; pre-existing controls test failure reproduced on unchanged main. Push/merge/deploy pending the repository-required exception decision; no expected assertions changed. See docs/ai-chat-audit-2026-11-20.txt.

Follow-up: user requested resolving the existing failure and merging/deploying. Controls regression migrated using f2cf57a/099d73a evidence, preserving safety assertions and adding independent control tests. 22 regression files pass.
