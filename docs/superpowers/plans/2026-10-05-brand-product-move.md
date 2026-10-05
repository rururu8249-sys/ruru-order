# 브랜드 이동·세부상품 정보 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 임시 독립 상품을 선택한 브랜드 하위로 안전하게 연결하고 세부상품별 한눈에 정보·상세설명을 편집한다.

**Architecture:** 원본 상품 행과 주문 ID를 유지한다. 이동 관계를 공통 카탈로그 모델로 해석하고, 이동·복원은 관리자 서버와 단일 DB 트랜잭션으로 처리한다. 기존 JSON 세부상품과 연결형 세부상품을 함께 지원하되 재고의 실제 소유자는 하나만 둔다.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Supabase PostgreSQL, 기존 Node 회귀검사 및 PGlite 격리 DB 검사.

**Spec:** `docs/superpowers/specs/2026-10-05-brand-product-move-design.md`

## 2026-10-05 검증 상태

- 구현·검수 보완: `c659981`. 독립 검수의 Important 7건과 표시 중복·키보드 접근 문제 수정.
- 전체 등록 테스트 17개, guard, TypeScript, production build 통과. 기존 deprecation/module 경고는 남음.
- 격리 DB에서 실제 이동 핸들러·운영 계좌/재고 함수 snapshot 실행: 원본 ID, 1회 차감, 중복 재시도, 재고 부족 rollback, 오래된 편집·복원 충돌 검사.
- 운영 migration 적용 및 Vercel READY 확인. 723개 상품 전체 digest가 migration 전후 동일하고 실제 이동·주문 테스트 데이터는 만들지 않음.
- 운영 읽기 전용 화면 확인: 전체 상품의 더보기→브랜드 하위 이동에서 원본 사진·가격·옵션별 재고와 브랜드 선택 후 최신 상태 조회를 확인하고 취소. 해당 탭 console error 0건. 운영 상품 이동은 실행하지 않음. 고객 브라우저→전체 제출 API→운영 DB 쓰기와 실제 네트워크 동시성까지 검증한 것으로 표현하지 않음.
- 기존 관리자 UI 정리 구현 이력(df44096, bb48c97, b385206, 8720faf, 54504c3)을 확인. 우측 패널·입금 응답 순서·설정 탐색/저장 보호·메뉴 테스트 5개를 다시 실행해 통과. 중복 구현하지 않고 남은 운영 동선 검수로 이어감.
- 이후 순서: 기존 관리자 UI 정리 계획의 입금 패널·설정 보호·전체 메뉴 검수, 이어서 YouTube 실제 방송시간과 매출 전략 분석.

## Global Constraints

- 브랜드나 품번은 사진을 보고 자동 추정하지 않는다.
- 기존 주문의 ID·상품명·금액은 바꾸지 않는다.
- 사진 URL·옵션별 재고·가격·설명은 원본 값 그대로 보존한다.
- 이동 때문에 이 API에 주문 쓰기 권한을 추가하지 않는다.
- 한눈에 정보는 부모와 같은 최대 6개/칩당 10자 규칙을 적용하고 입력 결과 미리보기를 둔다.
- 운영 고객 상품을 임의로 이동하지 않는다.
- UI만 먼저 운영 노출하지 않는다. 모델·저장·소비자 연계가 모두 통과한 후 배포한다.

## Review Focus

1. 기존 주문/딥링크가 원본 ID를 참조하는 상품: 이동 뒤에도 같은 상품·가격·재고로 조회되어야 한다(Task 4).
2. 두 관리자가 같은 상품을 수정/이동: 오래된 저장은 충돌 안내하고 새 상태를 덮어쓰지 않는다(Task 2).
3. 브랜드 기본가보다 낮거나 0원인 상품: 원래 판매가를 정확히 유지한다(Task 1).
4. 이름 변경/되돌리기: 사진·설명·옵션·재고가 다른 세부상품에 섞이지 않는다(Task 3, 5).
5. 원본과 브랜드를 같은 방송에 담기: 상품 표시·재고 차감·집계가 이중 처리되지 않는다(Task 4).

## Task 1: 스키마 확인 및 공통 연결 모델

**Files:** Modify `lib/productDetailModel.ts`; Create `lib/productBrandLinks.ts`, `scripts/test-product-brand-links.mjs`; Modify `package.json`.

**Interfaces:** `BrandProductLink={sourceId:string,parentId:string,detailName:string,originalName:string,movedAt:string}`. `resolveBrandCatalog(products:ProductLike[],links:BrandProductLink[]):ResolvedCatalog` returns `roots:ProductLike[]`, `detailsByParent:Map<string,ResolvedDetail[]>`, `bySourceId:Map<string,ResolvedDetail>`. `ResolvedDetail` extends existing DetailProduct with `sourceProductId:string`, `info:DetailInfo`. Linked prices/stock come from source row, never brand surcharge calculation.

- [ ] Read actual products ID/updated_at types, note shapes, stock-writing RPCs and all product-ID consumers using read-only queries. Record confirmed schema and consumer list in this plan; stop on unsupported assumptions before SQL implementation.
- [ ] Write failing tests: independent source price 0 and price below parent stay exact; source photos/options/stock unchanged; legacy details unchanged; parent+source roots contain source once; missing link source returns an explicit unresolved error, not a guessed product.
- [ ] Run `node --import ./scripts/_ts-resolve.mjs scripts/test-product-brand-links.mjs`; verify expected assertion failure.
- [ ] Implement the above interfaces with immutable inputs and explicit identity mapping. Do not copy stock into two owners.
- [ ] Run focused tests, product-search and widget-library tests; commit only task files.

## Task 2: 원자적 이동·복원과 관리자 인증

**Files:** Create `supabase/sql/product_brand_links.sql`, `app/api/admin-live/product-brand-move/route.ts`, `scripts/test-product-brand-move.mjs`; Modify `app/api/admin-live/catalog-write/route.ts` to guard linked-source deletion/parent overwrite, not expand allowed tables.

**Interfaces:** POST body `{action:'move'|'undo',sourceId:string,parentId?:string,detailName?:string,requestId:string,expectedSourceVersion:string,expectedParentVersion?:string}`. Success `{link:BrandProductLink|null,replayed:boolean}`; 401 unauthenticated, 400 invalid, 409 conflict/duplicate. Version is a canonical digest of relevant stored values, not an assumed updated_at column. DB move RPC accepts verified native ID types and the expected snapshot, locks IDs in consistent order, compares snapshots, and changes relation+audit atomically. Request ID is unique and idempotent.

- [ ] Write PGlite tests using the confirmed schema: unauthorized roles cannot execute RPC; duplicate name/code, brand-as-source, missing rows, source already moved are rejected; forced intermediate failure rolls back; same request replays once; concurrent/stale snapshots reject; undo preserves source.
- [ ] Run failing DB and real route boundary tests before production code.
- [ ] Implement relation/audit schema with RLS, service-role-only RPC, explicit search_path, row locking, idempotency and snapshot checks. Audit stores source/parent IDs, original/final name, timestamp and action, without customer data.
- [ ] Implement authenticated route using existing verifyAdminSessionFromRequest and server Supabase client; direct browser DB writes are forbidden. Preserve catalog-write's three-table whitelist and reject destructive writes that break active relations.
- [ ] Run isolated DB + route tests; record no production writes; commit.

## Task 3: 세부상품 정보 모델·편집

**Files:** Create `lib/productDetailInfo.ts`, `components/admin-live/quick-product/BrandDetailInfoEditor.tsx`, `scripts/test-product-detail-info.mjs`; Modify `components/admin-live/quick-product/QuickProductFastForm.tsx`.

**Interfaces:** `DetailInfo={mode:'inherit'|'custom'|'hidden',chips:string[],description:string}` stored under `brand_group.detail_info[detailName]` for legacy details. `resolveDetailInfo(parent:ProductLike,info?:DetailInfo):{chips:string[],description:string}`. Linked details use source-owned metadata. `BrandDetailInfoEditor` takes `{value,onChange,parentPreview}`.

- [ ] Write failing model/render tests: inherit vs empty custom vs hidden remain distinct; maximum 6 chips/10 Unicode characters each; line breaks persist; cancel leaves saved value intact; reopening and rename preserve only the correct detail's info.
- [ ] Implement pure resolution/validation; reuse current chip normalizer where compatible. Never mix order notice into descriptions.
- [ ] Add Basic / Photos·Options / Info·Description tabs to detail editor with visible Save/Cancel and preview. Update rename handling for info keys and protect linked data from parent save overwrite.
- [ ] Run detail-info tests and existing product tests; commit.

## Task 4: 고객·방송·위젯·챙김 연계

**Files:** Modify `app/order/page.tsx`, `lib/chatOrderProducts.ts`, `lib/widgetProductLibrary.ts`, `lib/orderItemPhoto.ts`, `lib/salesHistory.ts`, `components/admin-live/AdminLiveProductManagePopup.tsx`, and the stock RPC/consumer files confirmed in Task 1. Create `scripts/test-brand-linked-consumers.mjs`.

**Interfaces:** All consumers use Task 1's `resolveBrandCatalog` identity; `sourceProductId` is the persisted new order ID for moved products. Historical order snapshots remain unchanged. Detail info uses Task 3 resolution. Never use name similarity to find a source.

- [ ] Write failing integration fixtures: existing original-ID order and `/order?p=<sourceId>` still resolve; brand selection submits same source ID; parent+source broadcasts deduplicate; stock delta applies exactly once; legacy details and historical sales totals remain unchanged; detail chips/description switch when selected product changes.
- [ ] Integrate exact source-ID resolution at each discovered consumer boundary. Disable selection with clear explanation when link/source cannot resolve; do not substitute another item.
- [ ] Run linked-consumer tests plus sales-history, picking, widget-library, product-search and full registered test suite; commit.

## Task 5: 이동 화면·이력·되돌리기

**Files:** Create `components/admin-live/ProductBrandMoveDialog.tsx`, `scripts/test-product-brand-move-ui.mjs`; Modify `components/admin-live/AdminLiveProductManagePopup.tsx`.

**Interfaces:** Dialog props `{source:ProductLike,brands:ProductLike[],onClose,onMoved}`. Uses Task 2 POST only. Source/target before-after preview and version snapshots are loaded before confirmation; no automatic brand/name selection.

- [ ] Write failing render/interaction tests: More→Move opens correct source; brand and final name required; duplicate code blocked; photo/price/stock/info before-after shown; Cancel sends nothing; loading disables repeat; 409 preserves inputs and offers fresh review; success refreshes both lists; history Undo uses current snapshots.
- [ ] Implement searchable brand selection and preview, primary ‘이 브랜드로 이동’ action, warning that existing orders are preserved. Display moved source under brand instead of duplicate top-level entry; add move audit/undo entry.
- [ ] Run UI+model+route tests; browser-check desktop and narrow viewport with isolated fixtures, saving evidence. Never move a real customer product as a test; commit.

## Task 6: 최종 검수·운영 배포

- [ ] Review spec against all deliverables; request fresh read-only code review; resolve all critical/important findings.
- [ ] Run every registered `test:*`, `npm run guard`, `npx tsc --noEmit`, `npm run build`; report any warnings/failures by name rather than claim perfection.
- [ ] Verify isolated end-to-end move, edit, customer selection, original-order lookup, stock change once, undo and conflict. Save before-after screenshots and data comparisons.
- [ ] Apply only reviewed schema migration after confirming compatible production schema; deploy app after migration succeeds. Stop on mismatch; do not expose partial functionality.
- [ ] Verify deployment READY and perform read-only production UI checks. Report completed scope, unchanged original orders, and remaining queue: other admin-menu review, then YouTube-linked strategy analysis. Actual customer product move remains an explicit user action.

## Sources and self-review

### Confirmed live schema / consumers (read-only, 2026-10-05)

- products.id: bigint; updated_at: nullable timestamptz; product_note: nullable text containing JSON. No assumption that updated_at is a reliable version counter.
- Live product 752 (상품명 없음-6) stores stock_management_enabled and stock_variants under its own note. Brand 751 stores brand_group.detail_options, detail_categories and legacy combination metadata. IDs are used only as inspected evidence, not migration targets.
- Confirmed live inventory functions: admin_add_order_item(bigint,bigint,text,text,text,integer,integer,text), admin_update_inventory_linked_order_item(bigint,text,text,text,integer,integer,text), admin_delete_order_item(bigint,text), restore_order_inventory(bigint[],text), ruru_sync_product_inventory_variants().
- Local inventory_auto_deduct_rpc.sql links product_inventory_variants and inventory_ledger by bigint product_id; order submissions must retain source ID.
- Consumer boundaries: app/order/page.tsx; lib/chatOrderProducts.ts; lib/widgetProductLibrary.ts; lib/orderItemPhoto.ts; lib/salesHistory.ts; AdminLiveProductManagePopup.tsx; QuickProductFastForm.tsx. No name-similarity mapping is permitted.
- Model keeps legacy DetailProduct entries unchanged alongside ResolvedDetail links. The union type explicitly represents this compatibility; legacy details have no separate source row.

- Shopify official product details: https://help.shopify.com/en/manual/products/details
- PostgreSQL row locks/transactions: https://www.postgresql.org/docs/current/explicit-locking.html
- All spec sections map to tasks above. Five review-focus cases have explicit tests. Live schema is a required evidence checkpoint; native SQL ID types are not invented here.
- Execution proposal: Native sequential execution in this chat, one task at a time, final independent review. Implementation has not started; plan review is required first.
