# 회원 실제 화면 보완 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 사용자 첨부에서 확인한 중복 동작·약한 주문 경계·필터 구조 문제를 기존 데이터 계약을 유지하며 해결한다.

**Architecture:** 루트가 순서대로 수정한다. 독립 검토자는 설계 근거와 회귀를 읽기 전용으로 검토한다. 고객 식별·정렬·집계·차단 계산은 그대로 두고 표시 책임을 `MemberFilterToolbar`로 분리하며 정렬은 `AdminSelect`를 재사용한다.

**Tech Stack:** 기존 Next 16.4.6 / React 19.2.4 / TypeScript / Tailwind 4. 추가 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-11-20-member-ui-review-design.md`

## Global Constraints

- 로그인·회원 정체성·주문 소유·집계·금전·차단 저장 핸들러 변경 금지.
- 회원 20개 페이지/8종 정렬/기본값/선택 회원 유지. 전화번호 단독 차단과 회원 차단 필터의 범위 구별.
- 기존 관리자 토큰, 4px 격자, 폰 44px 터치/16px 입력, 포커스 2px 한 겹.
- 실제 데이터 쓰기 없이 fixture 검증. UI 기대값 변경은 사용자 요청에 따른 표시 계약에만 적용.

## Review Focus

- 드로어 안의 선택 메뉴에서 Esc가 부모까지 닫히지 않는지.
- 필터 초기화가 일괄 포인트 대상 선택을 지우지 않는지.
- 차단 목록(전화번호 포함)과 차단 회원 필터가 합쳐지지 않는지.
- 조회에 의존하는 필터가 실패를 0으로 표시하지 않는지, 독립 회원/검색/주문은 계속 열리는지.
- 긴 주문번호/다품목/포인트/주소가 360px에서 다른 주문과 섞이지 않는지.

## Task 1: 회원 상세 동작 정리

Files: `components/admin-live/AdminLiveCustomersPanel.tsx`, `scripts/test-member-ui-state-20261120.mjs`.

- [x] 표시 회귀 사례: X 한 개, 조회 푸터 없음, 기본 정보에만 한 개의 차단/해제, 편집 저장 유지.
- [x] baseline 실패 확인 후 X·관리 영역·편집 푸터만 수정.
- [x] 기존 drafts/blocked/async 테스트와 새 표시 사례 통과.

## Task 2: 선택 컨트롤과 필터 구조

Files: 새 `components/admin-live/AdminSelect.tsx`, 새 `components/admin-live/MemberFilterToolbar.tsx`, 고객 패널 연결, 새 `scripts/test-member-controls-20261120.mjs`.

Interfaces: `AdminSelect<T>({label,value,options,onChange,disabled?,className?})`; options는 value/label/disabled를 받는다. Toolbar는 기존 state 값·setter callback·숫자를 전달받으며 DB를 읽거나 쓰지 않는다.

- [x] 키보드·선택/disabled·Esc/Tab·외부값 변경·시트 열기/닫기 계약 테스트.
- [x] 스타일 선택 컴포넌트 구현. 부모 내부 DOM 유지, fixed 위치 화면 경계 보정, 중복 focus ring 제거.
- [x] 상태 칩 한 벌 + 별도 차단 목록/전화번호 도구, PC 컨트롤/모바일 필터 시트 연결.
- [x] 정렬/검색/reset/로딩/selectedPhones와 차단 목록 범위 검증.

## Task 3: 주문 단위 구분

Files: `components/admin-live/CustomerFullOrderHistory.tsx`, `scripts/test-member-order-layout-20261120.mjs`.

- [x] 번호 있는/없는 주문, 다품목·포인트 주문의 표시/펼침 계약을 fixture로 검증.
- [x] 주문 헤더·article 경계·펼침 상품/합계/배송 영역 정리. 계산과 쿼리 diff 없음.
- [x] 기존 전체 기간/legacy 연결/집계/오류 UI 테스트 통과.

## Task 4: 통합 검증 및 전달

- [x] DESIGN-ADMIN의 회원 보완 규칙 및 CLAUDE/기존 계획의 PR #49 배포 기록 교정.
- [x] 34종 회귀·전체 guard·TypeScript·build(58/58)·diff 점검, 독립 변경 검토.
- [x] PC/모바일·키보드·선택 메뉴 검증 범위 기록: 새 버전은 React fixture/소스/빌드 통과, 실제 브라우저는 아직 미검증. 기존 PR #49 운영 검수와 구분.
- [x] 수정 ZIP/한 번 붙여넣는 배포 명령 준비. 새 작업 폴더, 기준 commit/tree 대조, 검사 통과 후 PR/일반 병합/Vercel success 확인. 기존 사용자 작업 폴더를 덮어쓰지 않음.
- [ ] 배포 및 실화면 확인 후 상태 구분 보고.

### 검토 중 보완한 재현 사례

- 차단 조회 대기를 전체 회원에 적용하던 초안 회귀: 정상/차단 필터만 대기, 기존 모바일 회원 테스트 수정 없이 통과.
- 모바일 차단 목록 포커스/배경 스크롤 누락: 기존 모달 훅과 중첩 복귀 시험으로 보완.
- 상태 건수가 aria-label로 가려짐, 주문 상품 줄 수 누락, 주문 focus outline 잘림: 표시 구조 보완.
- 이미 열린 전화번호 폼의 재조회 실패: native fieldset으로 자식 입력/버튼을 비활성화하고 초안 보존.
- 제품 변경은 4개 회원 컴포넌트와 회원 영역 CSS에 한정. 저장/식별/집계 함수 AST 비교 결과 동일.
