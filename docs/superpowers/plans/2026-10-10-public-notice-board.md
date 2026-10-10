# Public notice board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 공지 제목 목록, 제목+내용 검색, 페이지 이동, 본문 아래 이전글·다음글·목록을 하나의 공개 게시판으로 통일한다.

**Architecture:** 기존 notices 공개 조회만 사용한다. 공지함을 열 때 공개 글을 안정적인 정렬로 100개씩 조회하며, 모든 조회가 성공한 뒤 검색 가능한 목록을 공개한다. 상품 로딩/30초 쪽지 폴링과 분리한다. 화면에는 10개씩 표시한다. 본문은 선택할 때 공개 여부를 다시 조회한다. 같은 컴포넌트를 공지함과 /notice에서 사용한다.

**Tech Stack:** React, TypeScript, existing Supabase anonymous client; no schema or dependency changes.

**Spec:** docs/superpowers/specs/2026-10-10-crm-operating-architecture.md

## Global Constraints

- 개인 쪽지/주문/결제 데이터 변경 금지. 공개 검색에 개인 쪽지 포함 금지.
- 상단 공지 직접 열기와 목록 진입 구분. 비공개/삭제/오류시 오래된 본문 숨김.
- 검색·페이지는 본문을 읽고 목록으로 돌아와도 유지.
- 큰 장식 헤더 없음. 기존 5개 관리자 메뉴 변경 없음.

## Review Focus

- 100개 이상 공지와 조회 중 실패: 일부를 전체인 것처럼 표시하지 않는다.
- 빠른 글 전환/동일 글 재열기: 늦은 응답과 이전 본문을 표시하지 않는다.
- 검색 결과 없음/긴 한국어 제목/좁은 화면: 초기화와 줄바꿈이 가능하다.
- 직접 연 글이 검색 결과 밖: 목록 복귀 조건 보존, 잘못된 이웃 글 연결 금지.
- 공개 글 열기: 개인 쪽지 읽음/발송 요청 없음.

## Task 1: Shared public notice board and integration

**Files:**
- Create: lib/publicNoticeBoard.ts (typed batched public reader)
- Create: components/notice/PublicNoticeBoard.tsx (search/list/detail/navigation)
- Modify: components/customer/CustomerSiteAlertPopup.tsx; app/notice/page.tsx
- Test: scripts/test-public-notice-board.mjs; scripts/test-public-notice-detail.mjs

**Interfaces:**
- Produces: PublicNotice, loadPublicNotices(client): Promise<PublicNotice[]>.
- Board consumes selectedId:number|null, onSelect(id:number|null), requestKey?:number.
- Existing banner event sets selectedId and increments requestKey; existing inbox event clears selection.

- [ ] Write failing tests: batched reader errors/visibility, 12 rows page 2, content search, detail back retaining page, previous/next boundaries, stale responses, direct banner no private writes.
- [ ] Run node scripts/test-public-notice-board.mjs; expected missing module/function failure initially.
- [ ] Implement reader and board; integrate existing public UI without touching private-note actions.
- [ ] Run npm run test:customer-notice and full test:* suite; expected all pass.
- [ ] Run npm run build and inspect rendered PC/mobile board; expected no build errors, no horizontal overflow, working navigation.
- [ ] Fresh code review, fix Important findings with failing test first, commit only scoped files.

## Research and decisions

- GOV.UK Pagination (2026-10-10): below content; no pagination for one page; accessible current page labels. https://design-system.service.gov.uk/components/pagination/
- Supabase range: zero-based inclusive endpoints, explicit deterministic order. https://supabase.com/docs/reference/javascript/range
- Full public notice search is deliberately separate from existing 10-item alert preview; no more data added to customer order startup. For much larger archives, server-side search can replace the reader without changing the UI contract.
- User explicitly requests continuous sequential execution, so no routine design approval pause.

## Progress

- Previous scoped work: compact card swatches 9f07b81 production READY, alias confirmed; 29 test commands and build passed.
- Shared public board implemented; focused tests, all 29 test commands and build pass. Independent review approved. Production/browser verification pending.
- Review minor: three additional regression cases (second-batch failure, outside-filter direct detail, empty-result reset) passed reviewer's temporary checks but are not all retained in the committed test file.
