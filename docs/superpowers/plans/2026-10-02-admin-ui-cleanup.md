# 관리자 UI 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 기능과 금융·배송 판정을 보존하면서 입금내역 우측 패널, 설정 탐색, 관리자 전체 화면의 목록 중심 레이아웃을 개선한다.

**Architecture:** 기존 5개 큰 메뉴와 13개 화면 키를 유지한다. 우측 패널은 단일 슬롯으로 관리하고 기존 입금 조회·판정 유틸리티를 재사용한다. 설정과 개별 업무 화면은 작은 단위로 변경하여 단계별 회귀 검증한다.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript, Tailwind CSS 4, 기존 Node assert/react-test-renderer 테스트. 신규 의존성 없음.

**Spec:** docs/superpowers/specs/2026-10-02-admin-ui-cleanup-design.md

## Global Constraints

- 주문·결제·배송 판정 및 Bankda 수집 정책은 변경하지 않는다. DB 마이그레이션과 운영 데이터 삭제 없음.
- 기존 13개 panel 주소, 12개 설정 항목과 저장 주체를 유지한다.
- 사용자 설명의 사용 순서는 참고 정보다. 추가 바로가기와 메뉴 순서를 근거 없이 확정하지 않는다.
- 데스크톱 일반 버튼은 36~40px 목표, 터치 환경은 44px 이상 클릭 영역. 1440×900, 1280×800, 390×844 검수.
- 금융·삭제·저장 경고는 숨기지 않는다. 미저장 입력을 자동 저장하지 않는다.
- 운영 사이트에서는 읽기 전용 검수만 한다. 실제 주문 제출·입금 연결·방송 종료·발송·삭제·챙김 체크를 테스트 목적으로 실행하지 않는다.
- Next.js 코드를 쓰기 전에 AGENTS.md와 node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md를 읽는다.
- 문서와 제품 코드 변경은 단계별로 분리해 되돌릴 수 있게 한다. scratch/와 사용자 변경은 보존한다.

## Review Focus

1. 연속 기간 변경과 늦은 입금 응답: 최종 선택 기간과 데이터가 일치하고 마지막 확인 목록을 오류 때문에 지우지 않아야 한다(Task 2).
2. 설정에서 메뉴 전환·공지 바로가기: 미저장 입력을 조용히 버리거나 자동 저장하지 않아야 한다(Task 3).
3. 직접 panel=payments 접속 및 패널 연속 전환: 패널은 하나이고 닫아도 주문 필터·선택·스크롤이 유지되어야 한다(Task 1).
4. 긴 상품번호·다중 옵션·다수 고객과 전체 기간 챙김: 범위·옵션·수량이 잘리거나 현재 방송으로 잘못 바뀌지 않아야 한다(Task 5).
5. 작은 화면·다크 모드·키보드 사용자: 주요 동작과 닫기, 메뉴가 접근 가능하고 경고가 사라지지 않아야 한다(Task 6).

---

## 파일 책임

- Create components/admin-live/adminLiveDrawerState.ts: 우측 단일 슬롯의 순수 상태 전환.
- Create components/admin-live/AdminLiveSideDrawer.tsx: 오버레이, 포커스, Esc, 폭과 닫기.
- Modify AdminLiveDashboard.tsx: 메뉴/URL과 우측 패널 연결. 주문 필터와 데이터 저장 주체 유지.
- Modify AdminLivePaymentPanel.tsx: 기존 열린 동안 동기화 수명 유지, drawer 표시 전달.
- Modify payment-ledger/PaymentMatchPanel.tsx 및 DepositDetailModal.tsx, DepositLedgerFilters.tsx, DepositLedgerSummary.tsx, DepositLedgerTable.tsx: 압축 목록·인라인 상세·조회 상태.
- Create adminLiveSettingsNavigation.ts 및 AdminLiveSettingsNavigation.tsx: 그룹/검색/기존 항목 이동. 저장 기능 없음.
- Modify AdminLiveSettingsPanel.tsx 및 자체 저장 폼: 입력 유실 방지와 기존 저장 경로 보존.
- Modify AdminLiveSidebar.tsx 및 업무별 기존 화면: 제한적인 탐색/여백/설명 정리. 전역 CSS로 폼을 일괄 축소하지 않는다.
- Create scripts/test-admin-live-drawer.mjs, test-admin-payment-drawer.mjs, test-admin-settings-navigation.mjs, test-admin-settings-drafts.mjs, test-admin-menu-layout.mjs: 기존 테스트 방식 재사용.
- Modify scripts/test-order-picking-ui.mjs: 범위 상시 표시 회귀 검증.
- Update outputs/admin-menu-audit.md: 화면별 관찰·변경·검증·남은 제한 기록.

### Task 1: 단일 우측 패널과 주소 호환

**Files:** Create adminLiveDrawerState.ts, AdminLiveSideDrawer.tsx; modify AdminLiveDashboard.tsx; test scripts/test-admin-live-drawer.mjs (components 경로는 모두 components/admin-live/).

**Interfaces:**
- export type AdminLiveDrawerState = {kind:"closed"} | {kind:"order";orderId:string} | {kind:"match";orderId:string|null} | {kind:"deposits"}.
- export function resolveAdminLiveDestination(menu: AdminLiveMenuKey): {screen:AdminLiveMenuKey;drawer:AdminLiveDrawerState}; payments → orders + deposits, 나머지 → 원래 screen + closed.
- SideDrawer props: {title:string;onClose:()=>void;width:420|560;children:React.ReactNode}. dialog 이름, aria-modal, focus trap, 이전 포커스 복원 책임.
- 기존 selectedOrderId 및 selectedOrderForMatch 데이터는 보존하되 공개 여부는 하나의 drawer 상태로 결정한다.

- [ ] Step 1: 순수 상태 테스트 작성. payments 주소는 orders/deposits, 전체 13개 키 유지, order→match→deposits 전환 시 단일 kind, close 시 주문 필터 값을 변경하지 않음을 assert.
- [ ] Step 2: node --import ./scripts/_ts-resolve.mjs scripts/test-admin-live-drawer.mjs 실행, 새 모듈 부재로 실패 확인.
- [ ] Step 3: 상태 모델/SideDrawer/대시보드 연결 구현. 주문 화면을 패널 열기 때문에 재마운트하지 않는다. 420px 기존 상세·매칭, 입금 560px 최대 폭. small full width.
- [ ] Step 4: 테스트와 npx tsc --noEmit 실행. 브라우저에서 주소 진입, 탭 선택, Esc, 연속 패널 전환, 닫기 포커스 복원 확인. 이 단계에서는 기존 입금 화면을 패널 본문으로 재사용한다.
- [ ] Step 5: 관련 파일만 git add 후 feat: unify admin right drawer navigation 커밋.

### Task 2: 압축 입금 목록·같은 패널 상세·조회 안전성

**Files:** Modify 위 payment-ledger 5개 파일, AdminLivePaymentPanel.tsx; test scripts/test-admin-payment-drawer.mjs.

**Interfaces:**
- PaymentMatchPanel Props에 presentation?:"page"|"drawer" 추가(default page). AdminLivePaymentPanel에서 drawer 전달.
- DepositDetailModal Props에 presentation?:"modal"|"inline" 추가(default modal). inline은 오버레이 없는 기존 상세 내용과 “목록으로” 제공.
- 목록 컴포넌트는 상세를 열어도 마운트 유지(hidden 처리), 따라서 검색·기간·정렬·scrollTop 유지.
- 조회 endpoint, RawDepositRow, getDepositStatus/getSafeOrderConnection/sortDeposits는 그대로 사용한다.

- [ ] Step 1: mock fetch + renderer 테스트 작성. 부모 목록 즉시 표시, 새 기간 요청 B 후 A 완료 시 B 유지, 최신화 실패 시 기존 목록 유지+오류, 초기 실패는 빈 정상 목록과 구분, unmount 후 응답 무시, 상세→목록 검색/기간/정렬 유지 assert.
- [ ] Step 2: node scripts/test-admin-payment-drawer.mjs 실행, 새 presentation과 응답 순서 가드 부재로 실패 확인.
- [ ] Step 3: useRef 요청 세대/수명 가드 구현. 실패가 성공 문구에 덮이지 않게 한다. 동기화 버튼은 기존 호출 경로 유지, 중복 클릭 잠금. 닫힌 패널의 타이머 종료.
- [ ] Step 4: drawer에서는 제목/닫기/새로고침 한 줄, 요약 한 줄, 검색/상태 바로 아래, 기간 입력은 접어도 적용 기간 항상 표시. 표가 560px에서 읽히지 않으면 drawer 전용 행 배치(입금자/금액/시각/기존 상태/보기). page 기존 사용처는 보존한다.
- [ ] Step 5: 테스트, npm run guard:bankda, npm run guard:bankda-cron 실행. 브라우저에서 긴 이름·금액·빈 목록·오류 mock·상세 왕복 검증.
- [ ] Step 6: feat: compact deposit ledger inside admin drawer 커밋.

### Task 3: 설정 그룹 탐색과 미저장 입력 보호

**Files:** Create adminLiveSettingsNavigation.ts, AdminLiveSettingsNavigation.tsx; modify AdminLiveSettingsPanel.tsx, ShopInfoSettingsTab.tsx, CombineShippingSettingsTab.tsx, ProductImageNoticeSettingsTab.tsx, YoutubeNotifyCard.tsx, TelegramNotifyCard.tsx, AdminLiveDashboard.tsx; test scripts/test-admin-settings-navigation.mjs, test-admin-settings-drafts.mjs.

**Interfaces:**
- export type SettingsTab = 기존 12개 union; export type SettingsDestination = {tab:SettingsTab;section?:"bank"|"payster"} | {menu:"notice"|"audit"}.
- export type SettingsNavItem = {label:string;destination:SettingsDestination}.
- export const SETTINGS_NAV_GROUPS: readonly {id:string;label:string;collapsedByDefault:boolean;items:readonly SettingsNavItem[]}[].
- export function searchSettingsNavigation(query:string): SettingsNavItem[]. 로컬 라벨 검색만.
- 자체 저장 폼에 onDraftStateChange?:(state:{dirty:boolean;saving:boolean;save:()=>Promise<boolean>})=>void 추가. save의 성공/실패 boolean만 전달, API 변경 없음.
- SettingsPanel에 onNavigationGuardChange?:(guard:null|(()=>Promise<boolean>))=>void; Dashboard는 화면 이탈 전 실행. “저장 후 이동/버리고 이동/계속 편집” 전용 선택창 사용. 저장 실패는 이동 금지.
- ShopInfoSettingsTab에 focusSection?:"bank"|"payster" 추가, 기존 구역에 id와 focus/scroll 연결. 새 편집 폼 없음.

- [ ] Step 1: 12개 항목 전부 접근, trend 기본 접힘+검색으로 찾기, 계좌/페이스터 동일 shop destination, notice/audit 기존 화면 연결 assert.
- [ ] Step 2: 위 탐색 테스트 실행, 새 navigation module 부재 실패 확인.
- [ ] Step 3: 6개 설계 그룹과 압축 탐색 구현. 검색/펼침은 activeTab과 입력 state를 변경하지 않는다.
- [ ] Step 4: drafts 테스트 작성 후 실패 확인. shop/combine/photo/youtube/telegram 및 공통 payment/point/order에서 수정→전환 취소 시 입력 유지, 버리기는 이동, 저장 실패는 이동 금지, 저장 성공은 기존 API 1회만 호출 assert.
- [ ] Step 5: 각 폼의 마지막 성공 로드/저장 snapshot과 현재 값 비교로 dirty 추적. 최초 loading을 dirty로 보지 않는다. callback 수명 종료 시 해제. 설정 이탈·notice/audit 바로가기에도 같은 guard 적용. 브라우저 local sound는 기존 적용 방식을 유지하고 서버 저장처럼 표기하지 않는다.
- [ ] Step 6: 두 테스트+npx tsc --noEmit 실행. 금융 경고와 기존 계좌 변경 확인창 보존, 취소/실패/재시도 동작 mock 검증.
- [ ] Step 7: feat: group settings navigation and protect drafts 커밋.

### Task 4: 관리자 공통 탐색과 업무별 밀도 정리

**Files:** Modify AdminLiveSidebar.tsx, AdminLiveDashboard.tsx, AdminLiveCustomersPanel.tsx, AdminLiveNoticePanel.tsx, AdminLiveProductManagePopup.tsx, AdminLiveEventRoulettePanel.tsx; test scripts/test-admin-menu-layout.mjs.

**Interfaces:** 기존 props, panel key, 데이터 조회 및 mutation handler 시그니처 유지. 새 메뉴·backend 없음.

- [ ] Step 1: 기존 ADMIN_LIVE_ALL_MENU_KEYS 13개/ADMIN_LIVE_TOP_MENUS 5개 유지, 고객 members/issues/loyalty/link 4개, 공지 customer/list/send/sent 4개, 상품 4개 탭, 이벤트 5개 접근 가능 assert. 이벤트 선택 role button/tab과 키보드 진입 검증.
- [ ] Step 2: node scripts/test-admin-menu-layout.mjs 실행해 개선 대상 레이아웃/접근성 assert 실패 확인.
- [ ] Step 3: 사이드바 반복 설명을 숨기고 명칭/예외 배지/접속/문의/카드/테마/로그아웃 유지. 공통 제목·탭 여백 압축, 큰 추가 바로가기 바는 만들지 않는다.
- [ ] Step 4: 고객·공지의 반복 설명을 축소하고 작은 탭 유지. 상품 수정 primary, 링크·복제 등 secondary만 더보기 후보로 옮긴다. 각 위험 동작의 확인창 유지. 이벤트 span 클릭 선택을 button/tab으로 변경하되 기존 setEventTab 동작 재사용.
- [ ] Step 5: 테스트+npx tsc --noEmit 실행. 각 화면 진입/돌아오기/닫기/입력 유지 확인. 업무별 테스트가 없는 부분은 다음 Task의 목록에 검증 상태 기록.
- [ ] Step 6: feat: simplify admin navigation and dense work lists 커밋.

### Task 5: 챙김 범위 표시와 남은 전체 화면 검수

**Files:** Modify LiveOrderPickingModal.tsx, scripts/test-order-picking-ui.mjs; update outputs/admin-menu-audit.md. 추가 코드 변경은 이 계획의 UI 범위에 해당하는 기존 업무 파일에만 한정.

**Interfaces:** orders/filterLabel/onClose 및 기존 picked_at 저장 경로 유지. 범위는 기존 filterLabel 그대로 사용, 현재 방송 추측 금지.

- [ ] Step 1: 기존 scope collapsed 테스트를 수정. filterLabel이 details 밖에서 항상 표시, 도움말만 접힘, 상품별/고객별 공통 상태·결제/챙김/정렬 필터 유지, 긴 범위 문구 보존 assert.
- [ ] Step 2: npm run test:picking 실행, 범위 상시 표시 테스트 실패 확인.
- [ ] Step 3: 제목 아래 짧은 범위 줄 배치, details에는 도움말만 남김. 기존 서버 확인 후 챙김 처리·실패/중복 클릭 가드는 변경하지 않는다.
- [ ] Step 4: npm run test:picking 실행, 기존 동기화/수량/옵션/저장 실패 테스트 전체 통과 확인.
- [ ] Step 5: 남은 주문/입금 상세, 고객 편집/이슈/환불 진입, 상품 등록/엑셀/옵션, 장바구니, 송장/일괄, 정산, 접속/보낸쪽지/계정연결 최종 조회, 시스템 점검을 열고 닫는 읽기 전용 검수. 발송·삭제·결제 등의 최종 버튼은 누르지 않는다. 폼 동작 회귀는 mock 데이터로 검증.
- [ ] Step 6: 모든 항목에 화면 확인/변경 불필요/개선 검증/접근 제한 중 상태와 근거 기록. 발견된 업무 로직 결함은 UI 작업에 몰래 섞지 않고 별도 보고.
- [ ] Step 7: fix: keep picking scope visible in compact layout 커밋.

### Task 6: 회귀·실측·배포 전후 확인

**Files:** Update scripts/guard-admin-ui.js (기존 계약 변경 필요 시 근거 포함), outputs/admin-menu-audit.md; create outputs/admin-ui-verification.md.

**Interfaces:** 테스트 결과와 화면 전후 측정의 보고서만. 운영 데이터를 수정하지 않는다.

- [ ] Step 1: 추가 테스트 전부, npm run test:picking, npm run test:combine-shipping, npm run guard, npx tsc --noEmit, npm run build 실행. 기존 scripts/test-*.mjs 전체도 기존 실행 옵션으로 실행하고 실패 목록 기록. 결제/계좌/배송/상품 회귀 실패면 배포 금지.
- [ ] Step 2: 1440×900/1280×800/390×844, light/dark에서 주요 13개 진입, 패널/설정/상품/고객/공지/챙김 접근 검증. 느린 응답/오류는 로컬 mock으로만 실행.
- [ ] Step 3: 동일 데이터·동일 viewport에서 변경 전후 목록 첫 행 y좌표, 상단 높이, 화면에 보이는 완전한 행 수 측정. 고객 개인정보가 담긴 스크린샷은 공개 산출물에 넣지 않는다.
- [ ] Step 4: 단계별 diff 리뷰. app/api、SQL、금액/배송/매칭 판정 변경이 섞이지 않았는지 git diff 확인. 접근성·저장 소유권·stale response·focus 회귀를 리뷰.
- [ ] Step 5: 모든 검증 통과 후 기존 배포 절차 사용. 배포 시 vercel:deployments-cicd 및 필요한 Vercel 스킬을 읽는다. 각 단계 커밋을 개별 되돌릴 수 있게 유지.
- [ ] Step 6: 운영에서 읽기 전용으로 입금 패널 왕복·설정 탐색·13개 메뉴 진입 확인. 결과/제한/남은 사용자 실사용 확인을 verification 문서에 남김. “완벽/버그 없음/최선 입증”이라 주장하지 않음.

## 구현 방식 및 검토 요청

이 계획은 같은 대화에서 순차적으로 직접 구현하는 방식(Native)을 추천한다. 대시보드의 공유 상태와 설정 저장 주체를 함께 확인해야 하므로 병렬 편집으로 충돌을 늘리지 않는다. 구현 전에 사용자가 이 계획을 확인하고 방식을 승인해야 한다. 다음 단계는 superpowers:executing-plans이며 승인 전 제품 코드 수정은 하지 않는다.
