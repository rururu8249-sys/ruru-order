# Broadcast recipient editor

Approved design: one result notice; searchable/sortable final list; explicit manual inclusion and exclusion; persist edits on redraw; obey opt-in, prior delivery, maximum count and 5% no-order cap. No live notification submissions during verification.

1. Reproduce duplicate result with real React renderer.
2. Add selector/API tests for editable signed manifests, opaque recipient IDs, full-list preview, consent/history rechecks, overflow and no-order cap.
3. Implement preview-only edit requests that re-sign the exact edited list; reshuffle with manual pins/exclusions. Return masked eligible members for search, never client-provided raw phones.
4. Add UI tests and controls for selected/member/excluded views, search, sorting, include/remove/restore, and counts. Filtering must never change send scope.
5. Run notification test suite, relevant regression suites and production build. Review diff and verify browser without live delivery. Deploy only verified change through existing workflow.
