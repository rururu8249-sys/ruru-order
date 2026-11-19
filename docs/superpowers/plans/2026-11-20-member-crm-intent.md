# 회원 관리 보완 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 회원 연결 의도를 유지하며 재현된 조회·정렬·상세 문제와 화면 사용성을 수정한다.

**Architecture:** 기존 목록·전 기간 집계·상세 조회 경로를 보존한다. 실패/빈값을 구분하고 기존 핸들러를 재사용한다. 표시 전용 수정과 운영 DB 쓰기를 분리한다.

**Tech Stack:** Next.js 16.4.6, React 19.2.4, TypeScript, Supabase, 기존 Node/React 테스트 도구.

**Spec:** `docs/superpowers/specs/2026-11-20-member-crm-intent.md`

## Global Constraints

- 카카오/전화번호 연결, 로그인, 실제 주문·입금·포인트 쓰기 기준 변경 금지.
- 기존 identity/lookup/lifetime 테스트 기대값 유지.
- 기본 최근 주문순·주문 있는 고객만 OFF·정렬 8개 유지. 과거접속순 결측값 먼저.
- DESIGN-ADMIN.md 기준과 기존 직접 요청 중 최신 확정 기준 적용.
- 실제 회원 정보·금전·발송·차단 변경으로 시험하지 않는다.

## Review Focus

- 조회 실패와 실제 이력 0건 구별.
- 서로 다른 계정의 비동기 응답이 뒤늦게 도착하는 경우.
- 결측일 두 개의 정렬 및 과거접속순 위치.
- 기본 정보 없는 프로필을 포함한 전체 조회 완료 판정.
- 휴대폰에서 상세·포인트·긴 닉네임·주소와 중첩 창의 포커스/닫기.

### Task 1: 기존 계약과 집계 표시 오류

Files: `lib/customerLifetimeStats.ts`, `scripts/test-member-crm-stats-20261120.mjs`.

- [x] 기존 식별/조회/누적 테스트를 변경 없이 실행.
- [x] unpaid/출고대기만 있는 행은 결제금액에 포함하지 않는 재현 테스트 작성·실패 확인.
- [x] 표시 분류에서 미결제 우선 및 출고완료 정확 조건만 수정.
- [x] 관련 기존 테스트와 새 회귀 테스트 통과 확인.

### Task 2: 목록과 상세 읽기 상태

Files: `AdminLiveCustomersPanel.tsx`, `CustomerFullOrderHistory.tsx`, 새 React 회귀 테스트.

- [x] 실제 컴포넌트를 모의 읽기 응답으로 실행해 실패가 0으로 전달되는 문제·차단 상세·준비 상태를 재현.
- [x] 오류 시 null 통계 유지·재조회, 목록 실제 수집행 검증·예외 처리, 안전한 페이지 종료 처리.
- [x] 두 날짜가 없으면 동률, 기존 결측값 위치 유지. 차단목록에서 openDetail 재사용.
- [x] 동일 회원/다른 회원 전환·읽기 실패·빈 이력·기본 필터·8개 정렬 회귀 확인.
- [x] 리뷰에서 재현한 구매자 필터 새로고침 중 대상 확대 및 A 회원의 늦은 저장 응답이 B 상세를 닫는 문제 수정·재검증.

### Task 3: 확정 디자인 적용

Files: 위 두 컴포넌트, `AdminLiveCustomerPointPanel.tsx`, `MemberAccessHistory.tsx`, 필요한 scoped CSS.

- [x] 현재 6개 캡처와 확정 디자인을 비교한 근거 기록.
- [x] 720px 오른쪽 상세/폰 전체, 머리·닫기 고정, 기본 정보/주문/포인트/접속 탭 유지.
- [x] 포인트 P 표시·짧은 문구·중복 판 정리; 저장 payload는 변경하지 않음.
- [x] 접속 기록 빈값/오류/재조회·참고 정보 표기를 명확히 유지.
- [x] 다크모드 토큰 조합과 중첩 창 포커스 보완·컴포넌트 검증.
- [x] 운영 브라우저 폰 4폭·PC 렌더·키보드 읽기 검수. 실기기 터치·다크모드 전체 실화면은 별도 미검증.

### Task 4: 리뷰와 배포

- [x] 독립 리뷰로 변경이 기존 의도를 보존하는지 확인.
- [x] 회귀 테스트 32종, guard, tsc, npm run build, git diff --check.
- [x] 사용자 터미널로 PR #49 병합, main 43297a0 및 Vercel success/tree 일치 확인.
- [x] CLAUDE.md 진행상황·검증 결과를 실제 PR #49 배포 및 읽기 검수 상태로 갱신.
- GitHub 앱 쓰기 403은 우회하지 않고 사용자 CLI로 반영했다. 사용자 캡처에서 확인된 UI 미완성은 후속 회원 UI 계획에 이어서 처리한다.

### 필수 검사 중 확인한 기존 결함

- [x] 관리자 UI 기준 검사: 기준 커밋의 기존 26건을 디자인 문서와 대조. 글자·간격·색상·숫자 정렬 보완, 조건부 hover/짧은 다음 행동 안내의 오탐은 실제 위반을 계속 잡는 의미 테스트와 함께 수정. 최종 121파일·0건.
- [x] 옵션 가드 기존 4건: 자연어/상품명 검색 토큰화 3건은 정확한 표현식만 예외. 실제 옵션을 나누는 안내문 1건은 2026-09-08 확정 규칙으로 수정. 등록 sizes 배열 우선, 레거시 명시 필드 폴백, 다른 사이즈 공통 안내 방지.
- [x] 예외 주변·같은 줄의 잘못된 옵션 분리도 거부하는 가드 회귀 테스트.

검증 기록: `docs/superpowers/specs/2026-11-20-member-crm-intent.md`.
