# Product Option Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재현된 옵션 시트 상단의 반복 전환을 제거한다.

**Architecture:** CustomerBottomSheet에 기본 비활성인 stabilizeHeaderHeight와 일반 초기화 키를 추가한다. 옵션 시트만 활성화한다. 초기 측정과 크기 관찰은 헤더 높이만 관리하고 스크롤·주문 상태를 변경하지 않는다.

**Tech Stack:** 기존 Next 16.4.6 / React 19.2.4 / TypeScript / react-test-renderer.

**Spec:** docs/superpowers/specs/2026-11-20-product-option-header-design.md

## Global Constraints

- 200px 기준과 64px 썸네일, 브랜드 선택의 44px 로고·빨간 안내 보존.
- 공유 시트 opt-out은 기존 동작 유지. 주문·회원·결제·DB 수정 없음.
- 실제 측정값에 근거하며 임의 지연·전환 임계값 변경 없음.

## Review Focus

- 헤더 패딩·테두리가 반복해서 더해지지 않는지.
- 소수점 높이, 콘텐츠/폰트 증가를 처리하는지.
- 닫기·재열기·상품 교체가 높이만 초기화하고 history를 다시 쌓지 않는지.
- 선택 상태 복귀와 사진 확대가 기존 콜백을 유지하는지.
- 기본 비활성 시 다른 시트에 측정/스타일 변경이 없는지.

## Task 1: 높이 보존과 회귀 검증

**Files:** components/customer/CustomerBottomSheet.tsx, app/order/page.tsx, scripts/test-product-option-header-20261120.mjs

- [x] 실제 시트와 운영 측정값을 사용한 테스트를 작성하고 기존 코드에서 실패 확인.
- [x] opt-in 헤더에 초기 측정, ResizeObserver, border-box min-height, 정리·초기화 추가.
- [x] 옵션 시트에서만 활성화하고 상품 ID를 초기화 키로 전달.
- [x] 회귀 테스트와 관련 기존 테스트, guard, tsc, build 실행.
- [x] 독립 검토 및 배포 가능한 패키지·명령 준비. 배포 상태를 구분해 보고.

## 진행 기록

- 운영 재현: 400×737, 헤더 높이와 본문 끝 위치의 200px 왕복 확인.
- RED: 기존 시트가 86.59375px에서 77px로 줄어드는 재현 검사 실패 확인.
- GREEN: 신규 8개 시나리오 및 관련 13종 검사 통과. guard, TypeScript, 운영 빌드 통과.
- 독립 검토: 필수 수정 없음. 실제 호출부 속성·스크롤 핸들러 검사 추가.
- 기존 할인 테스트: 기준본에서도 같은 실패 확인, 10월 29일 원본 커밋 의도에 따라 표시/숫자 저장을 각각 검증. 제품 가격 로직 변경 없음.
- 최종 ZIP과 적용 스크립트 검증 결과는 패키지 verification에 기록한다. 운영 배포는 별도 단계다.
