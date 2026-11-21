# Slider chat pacing implementation plan

> Execute inline with superpowers:executing-plans; verify before completion.

Goal: Honor the user's latest instruction to replace the fixed six proactive messages/hour limit with administrator chat intensity in live, paused and replay modes. Preserve grounded current-card/today-order conversation, anti-repetition, real-customer priority and financial isolation.

Evidence: production admission still caps at six/hour; room/failed rests use legacy high/normal/low rather than percent; TS final room turn uses fixed 150/360 seconds although initial scheduling reads percent. Prior six/hour documentation is superseded by this explicit user request, not by a failed test.

Architecture: Keep existing percent interpolation. Share a phase-aware TS timing helper across scheduling and final room check, mirror it in a service-only DB policy with parity tests for all percentages/modes. Preserve minimum one proactive/minute and two total/minute. Live minimum 60 seconds reflects that existing DB safety floor; off-air minimum120 seconds and 2.4x interval reflect existing slower off-air design. Remove hourly-six cap. Bound persisted rest by current policy so slider increases cannot retain an old long rest. Actor rest remains derived from interval (two maximum gaps). Keep focused model retry budget and all quality/identity guards.

- [ ] Write regression showing seventh/hour is permitted when interval is due, zero blocks, lower slider slows, live/paused differ, settings changes take effect.
- [ ] Implement common phase timing and DB migration, preserve trigger notice branches.
- [ ] Verify DB policy/TS parity and actual Director grounding in three modes; existing automation regressions, type/build.
- [ ] Independent review, merge, apply migration, confirm production deployment.
- [ ] Read actual production messages/product keys and worker logs; distinguish observed phase from locally tested phases.

No fixed words, fake order claims, quota bypass, manual public test chat or customer/order writes.

Additional reproduced blockers: system notices reset lastAi although DB excludes them; visible-window churn/clear must retain nonbot lastAi from existing quality-memory rows. hasNewGroundedInterest exhausted each product for90min even for a distinct interest; allow same verified product with a new nonoverlapping interest while keeping same-product/topic and recent two-topic repetition rejection. Preserve low-intensity90s human quiet protection (others60s matches final TS). Existing prior tests moved hidden repeat fixture to180s so it still exercises semantic memory after new rest, and short-gap fixture60s→30s because the explicitly requested high live interval now admits at60s.

Production follow-up after PR64 (06:48:41Z): actual06:48:47 CP-1 appearance candidate was blocked by room new-interest rule, but recovery only recognized two identical recent topics. Reproduced mixed appearance/fit history in actual Director test (one model call, zero sends). Use one roomFor predicate for recovery, draft selection and final check; feed room rejections back to generation and list latest two interests. Align recovery cooldown with phase slider gapMax with120s minimum; pending humans/quota errors still do not trigger retries. Old opportunity tests now assert new120s retry boundary, not superseded3/5min constants. New actual Director regression passes live/paused/replay and all previous semantic/source guards. No DB changes for this follow-up.

Production follow-up06:55:15Z: BB-60 material curiosity was rejected as an unanswered off-air question, a content gate rather than room gate. Unified draftFor(content/style/quality/room) now validates both initial independent choice and focused candidates; all unusable independent drafts may use the existing bounded retry. Explicit replies remain separate. Rejected primary is cleared even if recovery cools or produces no candidates. Candidate prompt now renders existing rejectedLines plus current rejection. Actual Director red/green covers off-air question→non-question, cooldown and empty-retry rejection preservation. Independent reviewer found the primary resurrection path before deployment; fixed and regressions pass. Type/build and topic-wave/candidate regression pass.
Production06:57:47 logs also showed fallback record replacing focused attempt. noteDecision is read/upsert; serialize awaited writes within runRoomDirector to preserve retry/feedback state. Actual Director regressions and typecheck pass after this ordering correction.
