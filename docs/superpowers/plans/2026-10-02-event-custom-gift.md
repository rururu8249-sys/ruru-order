# 직접입력 경품 자동 주문등록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 직접입력 이벤트 당첨자의 해당 방송 최신 유효 주문서에 상품명 그대로 수량1·0원·옵션없는 경품을 한 번만 추가하고, 실패·재시도·동시 실행 및 기존 포인트 비간섭을 검증한다.

**Architecture:** 직접입력에만 서버 설정 스냅샷과 원자적 경품 처리 RPC를 추가한다. 기존 orders 상품 줄 모델과 주문 그룹을 재사용하며, winnerId별 receipt를 최종 중복 방어와 재시도 근거로 사용한다. 기존 포인트 자동지급과 미션 지급 코드는 변경하지 않는다.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript, Supabase/PostgreSQL, 기존 Node 테스트 loader. 실제 동시성은 다중 연결 PostgreSQL 격리 환경에서 검사한다.

**Spec:** `docs/superpowers/specs/2026-10-02-event-custom-gift-design.md` (사용자 포인트 범위 확인 반영 버전).

## Global Constraints

- 실행 방식: 이 세션에서 순차 inline 실행, 마지막에 독립 검토. 사용자 소유 scratch/와 unrelated 변경 보존.
- 새 기능은 직접입력 경품만. 기존 포인트 자동지급 API·RPC·금액·타이밍·미션을 교체하지 않는다.
- 상품명 앞뒤 공백 제거, 내부 문자열 그대로, 최대40자, 수량1, 금액 모든 열0, 옵션 NULL, product_id NULL, picked_at NULL.
- 방송은 event.broadcast_id로 고정; orders.broadcast_id uuid / event.broadcast_id text 타입 차이 검증.
- 최신 선택은 원래 상품 줄 created_at DESC, id DESC; 경품 줄 제외. 최신 유효 주문은 미결제도 허용.
- 삭제·영구삭제·취소·테스트 주문 제외. 고객 모호함/주문 없음/방송 없음은 자동등록 중단 및 사유 표시.
- 성공한 winnerId 재시도는 기존 receipt를 반환. 주문 취소/삭제 후에도 자동 재추가나 최신 주문으로 이동하지 않는다.
- 경품 상품 줄·receipt·당첨 완료 마킹 한 트랜잭션. widget/iframe/애니메이션은 처리 실행자가 아니다.
- 신규 함수 SECURITY INVOKER, service_role만 EXECUTE; 신규 receipt RLS. 개인정보는 공개 overlay에 추가하지 않는다.
- 운영 고객 데이터로 장애·지급 실험 금지. 금융 실패는 실패로 기록, 별도 설명/승인 전 포인트 코드 수정 금지.
- 실제 병렬 격리 검증 불가 시 동시성 통과/안전 검수 완료로 보고하거나 배포하지 않는다.
- Supabase migration 파일은 CLI migration new로 생성한 실제 경로를 ledger에 기록한다. 이름 추정 금지.

## Review Focus

- 새 줄 때문에 이미 완료된 주문이 챙김완료로 남는 누락: Task4 실제 목록과 두 챙김 view에서 안 챙김 증가 검증.
- 동일 닉네임의 고객 두 명·잘못된 snapshot 주문: Task2 ambiguity 오류와 주문0개 검증.
- DB commit 후 HTTP 응답 유실: Task3/5 재시도 동일 receipt·동일 주문 줄1개 검증.
- 취소와 경품 추가가 동시에 실행: Task2/5 lock 후 재검증, 유효 대상 없으면 rollback 검증.
- 구버전 관리자와 신규 앱 혼재·이전 기록 문구가 경품으로 오인됨: Task1/3 custom_gift_name NULL 미처리 및 포인트 경로 비간섭 검증.

## 파일 책임

- `lib/eventCustomGift.ts`: 순수 직접입력 설정 검증·응답 계약. DB/포인트 호출 없음.
- `supabase/migrations/<CLI가 생성한 실제 파일>`: additive 열·receipt·직접입력 확정/추가 RPC, 최소 권한.
- `app/api/admin-live/event-custom-gift/route.ts`: 관리자 인증, winnerId 형식 검증, GET 상태/POST 원자 등록 호출.
- `app/api/admin-live/event-roulette/route.ts`: 직접입력 설정 저장, 직접입력 판만 원자적 당첨 확정, 관리자 결과 필드 제공.
- `components/admin-live/useEventCustomGift.ts`: 직접입력 당첨 처리/재시도 상태. point 분기 호출 없음.
- `components/admin-live/EventCustomGiftStatus.tsx`: 당첨자별 처리 상태·주문번호·실패 재시도 표시.
- `components/admin-live/AdminLiveEventRoulettePanel.tsx`: 직접입력 생성 payload/서버 확정 후 hook 연결, 기존 지급 분기 유지.
- `lib/eventRoulette.ts`, `components/admin-live/LiveStatsPanel.tsx`, `components/admin-live/AdminLiveDashboard.tsx`: 경품 origin을 판매 수량/응모권에서 제외하되 주문·챙김에는 포함하는 최소 연결.
- `lib/orderSchemaQueries.ts`, `lib/orderLinesColumns.ts`, `app/api/admin-live/order-lines/route.ts`: 실재 gift origin 열과 0원 줄의 조회·표시 계약.
- 관련 고객 조회·엑셀·통계 consumer의 실제 경로는 Task4 첫 체크에서 rg로 확정해 ledger 기록. 다른 구조가 발견되면 임의 우회하지 않고 계획 차이를 보고.
- `scripts/test-event-custom-gift-*.mjs`: 순수/route/실제 컴포넌트/격리 DB 검수. financial tests는 기존 코드를 실행하며 발견결함 수정하지 않음.

---

### Task 1: 직접입력 설정 스냅샷과 구버전 비간섭

**Files:** Create lib/eventCustomGift.ts, scripts/test-event-custom-gift-contract.mjs. Modify app/api/admin-live/event-roulette/route.ts. Migration additive custom_gift_name text NULL, winner_order_ids jsonb on winner, orders.event_gift_winner_id uuid NULL 및 custom receipt (Task2 함수와 같은 실제 migration).

**Interfaces:**
- normalizeCustomGiftName(value: unknown): string — trim, JavaScript length 1..40 (현재 input maxLength=40과 동일); 실패는 Error.
- EventCustomGiftResult = {ok:true; status:'added'|'already_added'; winnerId:string; orderId:string; orderGroupId:string|null; lookupCode:string|null; productName:string; targetState:'active'|'removed'|'canceled'} | {ok:false; code:string; message:string}.
- 이벤트 관리자 타입 custom_gift_name:string|null, 각 winner order_ids:string[]. 공개 overlay에는 새 소유자 필드 없음.

- [ ] Step1 실패 테스트: normalizeCustomGiftName('  선물 A  ') === '선물 A'; 빈 값/41자 거부; '<선물>' 그대로 text; create_event custom일 때만 스냅샷, point/legacy NULL, test/preview 실제 주문0.
- [ ] Step2 실행: node --import ./scripts/_ts-resolve.mjs scripts/test-event-custom-gift-contract.mjs → 최초 관련 기능 부재 FAIL 확인.
- [ ] Step3 순수 helper 및 createEvent 직접입력 처리 구현. giftType이 custom인 요청에만 snapshot 저장; point payload/기존 검증/응답 동작 유지. 모든 select 열 운영 schema와 대조.
- [ ] Step4 같은 테스트 PASS, test-event-overlay-contract.mjs / test-event-reward-display-boundary.mjs PASS.
- [ ] Step5 변경 파일만 선택 stage 후 commit.

### Task 2: 최신 주문 선택 및 원자적 경품 등록 DB 계약

**Files:** Task1 migration, scripts/test-event-custom-gift-db.mjs, scripts/event-custom-gift-db-fixture.mjs.

**Interfaces:**
- public.admin_register_event_custom_gift(p_winner_id uuid) returns jsonb (EventCustomGiftResult).
- public.event_custom_gift_receipts: winner_id uuid PK (감사 ID, 삭제된 winner에도 유지), event_id uuid, order_id bigint, order_group_id text NULL, lookup_code text NULL, product_name text, created_at timestamptz. 원래 경품 주문 삭제 후도 receipt 유지.
- orders.event_gift_winner_id uuid unique WHERE NOT NULL. 신규 source 열 nullable로 기존 row 영향0.
- 함수는 service_role만 실행, public receipt SELECT/write 불허. 관리자 endpoint가 반환값을 소비.

- [ ] Step1 격리 DB 실패 검사: 3개 유효 주문 최신만1줄, 취소 최신 제외, 다른 방송/삭제/테스트 제외, nickname충돌/고객ID충돌/주문없음은 주문0/receipt0, 기존 챙김완료에서 새 줄 picked_at NULL. assert 새줄 qty1/product_price0/final_amount0/shipping_fee0/vat_amount0/point_used_amount0/product_id NULL/color NULL/size NULL 및 원주문금액/address/bank/points 동일. 최신 주문에 order_group_id와 order_lookup_code가 모두 없으면 ORDER_GROUP_UNLINKABLE로 중단; 임의로 이전 주문에 추가하거나 기존 그룹을 변경하지 않음.
- [ ] Step2 실행: node --import ./scripts/_ts-resolve.mjs scripts/test-event-custom-gift-db.mjs → RPC 부재 FAIL 확인. fixture는 합성 고객·주문과 운영에서 확인한 DDL/함수만 사용.
- [ ] Step3 PostgreSQL 함수 구현: 당첨 행 잠금 → live/custom 여부 → 기존 receipt 반환 → 저장 snapshot에서 한 고객 확정 → 해당 방송의 최신 원래 상품 줄 그룹 선정/기준행 잠금 후 재검증 → 직접입력 orders 줄 생성 → receipt → 완료 마킹. 전부 한 transaction. existing admin_add_order_item 사용 시 실제 함수 정의·복사필드·권한/0원 상태를 확인; 부적합하면 새 함수 내부의 명시적 실재열 INSERT 사용. 어느 방식이든 기준 주문 선택을 client에 맡기지 않는다.
- [ ] Step4 각 단계 SQL 예외주입 fixture로 상품/receipt/마킹 모두 rollback, 응답 유실 재호출은 id 동일/줄1. 기존 자동적립 trigger 설치한 fixture에서 포인트/재고 변화0. API 함수 권한 anon/authenticated denied, service allowed.
- [ ] Step5 PASS 출력·선택 SQL·schema 대조 결과 기록 후 migration/tests commit. 격리환경 미확보면 완료하지 않음.

### Task 3: 직접입력 판의 당첨 확정·등록 API

**Files:** Create app/api/admin-live/event-custom-gift/route.ts, scripts/test-event-custom-gift-api.mjs. Modify app/api/admin-live/event-roulette/route.ts, migration custom 확정 RPC.

**Interfaces:**
- POST /api/admin-live/event-custom-gift {winnerId:string} → EventCustomGiftResult; 인증실패401, invalid400, notfound404, ambiguity/conflict409, DB실패500. 성공은 서버 확인 때만.
- GET /api/admin-live/event-custom-gift?winnerId=... → {ok:true;status:'pending'|'added';result?:EventCustomGiftResult}; admin-only/no-store.
- public.admin_finalize_custom_gift_event(p_event_id uuid,p_winners jsonb,p_started_at timestamptz,p_duration_ms integer) returns jsonb. server candidate winners shape [{nickname:string,orderIds:string[]}]. 잠금 후 event custom/live/test·participant membership·orderIDs 원 snapshot과 대조; 이미 result면 기존 당첨 행 반환. 기존 server 추첨확률·결정 결과 보존, custom 분기만 transactional save. point 판 기존 handler 유지.

- [ ] Step1 실패 테스트: auth/noauth, invalidwinnerId, forged전화/금액/상품명은 거부, unknownDBcolumn/timeout은 성공아님, GET 개인정보 public0, custom 동일 event 확정2회 결과/당첨행 동일, point 정상 분기 추가경품API0.
- [ ] Step2 실행: node --import ./scripts/_ts-resolve.mjs scripts/test-event-custom-gift-api.mjs → route 부재 FAIL.
- [ ] Step3 API 구현. body winnerId 이외 입력 허용하지 않음. custom 생성 feature flag EVENT_CUSTOM_GIFT_ENABLED 환경값 true에만 허용, 꺼짐은 설명오류(포인트로 fallback 금지). 이미 저장한 custom 판의 처리·상태조회는 앱rollback 전 서버가 있는 동안 허용. overlay/서비스 worker가 쓰기 처리하지 않음.
- [ ] Step4 API PASS 및 기존 event overlay/token/privacy/reward tests PASS.
- [ ] Step5 commit.

### Task 4: 관리자 자동 추가·재시도와 주문/챙김 표시

**Files:** Create components/admin-live/useEventCustomGift.ts, EventCustomGiftStatus.tsx, scripts/test-event-custom-gift-ui.mjs, scripts/test-event-custom-gift-orders.mjs. Modify Panel 및 위 파일 책임의 조회·통계 consumer.

**Interfaces:**
- useEventCustomGift(winners:readonly {winnerId:string;isTest:boolean;customGiftName:string|null}[]): {states:Record<string,{status:'pending'|'adding'|'added'|'failed'|'unknown';result?:EventCustomGiftResult;message?:string}>; retry:(winnerId:string)=>Promise<void>}.
- EventCustomGiftStatus receives {states,retry}; 정상 document flow, 시작/재시작 버튼 덮지 않음.
- DB commit 성공 후 window.dispatchEvent(new Event('event-custom-gift-added')); Dashboard가 리스너로 실제 주문 refetch. 서버값으로 재조회하며 임의 로컬 성공줄 삽입 금지.

- [ ] Step1 실제 Panel 실패 검사: roulette/claw/survival/race custom 입력→확정된 모든 winnerId POST; point/test/preview POST0; 입력/탭변경/iframe load/재연결은 추가 요청0; 부분 실패는 사람별 표시, retry 성공건0; 두 mount는 같은winnerId 요청해도 DB중복방어.
- [ ] Step2 실제 orders 소비 fixture 실패 검사: 최신 그룹에 경품 표시, customer/admin/엑셀 qty1/0원/옵션empty, 챙김 total+1/got유지, 두 view 체크동일, 결제완료필터에 해당 paid 그룹 유지. 일반 취소/삭제표시 그대로.
- [ ] Step3 custom hook/status 및 Panel 연결. 기존 grantPointToWinner/Survivors/미션 처리 수정금지. UI40자/빈상품명 start막기. metadata수정시 이미시작 custom 설정변경금지. pending 복구는 명시적 retry로 처리, 임의과거경품 backfill금지.
- [ ] Step4 gift origin을 응모권·판매 수량에서 제외. 고객/주문/물건챙김 줄에는 유지. 실제 stats consumer/DB refresh 함수 정의를 읽고 NULLproduct_id 제외가 이미 적용된 항목은 변경하지 않음. 필요한 reader에만 gift origin 열/필터 추가. existing customer API조회가 directSupabase면 그 실제 consumer를 테스트한다.
- [ ] Step5 두 테스트 PASS와 picking/customerlookup/point/reward 회귀 PASS. 새줄 추가 후 원금·입금매칭 대상총액·계좌변경0 대조.
- [ ] Step6 commit.

### Task 5: 실제 동시 연결·실패 시뮬레이션과 금융 비간섭

**Files:** Create scripts/test-event-custom-gift-concurrency.mjs, scripts/test-event-financial-failures.mjs. Reuse fixture actual PostgreSQL sessions; existing production financial route unchanged.

**Interfaces:** 격리 PG 연결주소 EVENT_GIFT_TEST_DATABASE_URL. 테스트가 production project host rpmpqudiscpasivrwuyz 및 production environment를 거부한다. 단일 PGlite 인스턴스/직렬 RPC mock을 다중 연결 증거로 사용하지 않는다.

- [ ] Step1 같은winnerId20 parallel 실제RPC→orders경품1/receipt1, 모두동일orderId. 같은eventId2 parallel finalize→정확히동일 winner rows. 서로다른winner2 samecustomer→gift2, 최신정상그룹. gift추가/취소동시→lock후 유효상태, 없는유효대상은rollback.
- [ ] Step2 실제 API응답 commit후drop/JSON손상→GET상태/재시도 같은줄. 단계별등록/receipt/마킹fail→부분저장0. GET失敗를 success로 해석하지 않음.
- [ ] Step3 기존 실제 포인트 API 격리실행: grant5xx/4xx/JSON/network, ledger실패/balance실패/rollback실패, sourcekey동시2, 서로다른sourcekey동시잔액합산, 최초balance동시생성, 마킹실패후retry. 그 전후 financial 데이터와 API이력 저장 결과를 대조. test-event-reward-display-boundary는 기존14 flows에 별도 두mount/오류transport fixtures추가하되 기존 성공 기대 유지.
- [ ] Step4 직접입력 작업 전/후 포인트 호출과 동일실패시나리오 결과 비교, 직접입력 경품이 포인트 쓰기0임을 증명. 관련 orderpoint writer 정의·교차 실행 가능한 범위를 기록. 기존 포인트 실패 재현은 FAIL 리포트/별도승인사항으로 남기며 코드나 기대값 완화금지.
- [ ] Step5 재현결함 분류: 새작업결함→TDD수정; 기존포인트결함→근거/영향/승인요청; 검증환경제약→미실행. 구분 없이 전체PASS 보고금지.
- [ ] Step6 검사 기록/tests commit. 금융검증 결함이 안전출시를 막으면 별도결정 전 배포중단.

### Task 6: 전체 검수·독립 리뷰·단계 배포

**Files:** outputs 검수보고서/스크린샷, plan ledger. 임시 브라우저fixture app route는 배포전에 제거.

- [ ] Step1 전체 scripts/test-*.mjs 실행, npm run guard, npx tsc --noEmit, npm run build. 0failed/exit0 확인. 새 SQL 로컬테스트와 실제다중연결 검사 결과 별도 포함.
- [ ] Step2 localhost fake DB/API경계에서 실제 관리자 두창: 상품입력·경품당첨·최신주문·0원·양쪽챙김안챙김증가·조회재시도·긴문구·360/1280·start버튼무가림 검증. 실제고객/금융POST차단. 스크린샷outputs저장.
- [ ] Step3 최종 독립 read-only review: identity/권한/원자성/최신그룹/금액/포인트분기비간섭. Important/Critical은 TDD수정 후 관련및전체회귀, 미실행한 항목 명시.
- [ ] Step4 Supabase현재schema/함수/권한 재대조 및 advisors. 확정migration 적용부터APP배포까지 flagOFF 상태; 존재안하는컬럼을 구버전코드가조회하는지 검사. 신규RPC 권한0public 확인.
- [ ] Step5 기존승인Git배포방식으로배포. SHA/상태/read-onlyadmin/custom설정노출/order기존조회 검수. 고객추첨/포인트지급/실주문append를 smoke로실행하지 않음. 새실행 활성화는 배포환경 flag설정과검사로기록.
- [ ] Step6 운영검증불가/SQL불일치/신규실패이면활성화중단. rollback은앱이전버전/flagOFF, receipt/이미추가경품·고객금융데이터삭제금지.
- [ ] Step7 완료보고에는 실제실행한검사·실패·제한·운영SHA·사진을 제공, 기존포인트결함남은상태를 숨기지 않음.

## Self-review

설계1~6/8: Task1~4. 설계7 금융추가검수/비수정: Task5. 설계9 검증매트릭스: Task1~6. 설계10배포/rollback: Task6.
포인트RPC교체/잔액수정은 명시적으로 제외. custom_gift_name/receipt/winnerId/응답상태를 tasks간 일치시켰다. 원자등록과 실제다중연결 증거를 분리했다. 확인되지 않은실제환경이 준비됐다고 가정하지 않는다.
