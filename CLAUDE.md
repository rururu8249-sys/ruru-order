@AGENTS.md

# CLAUDE.md — 루루동이 프로젝트 지침

## ★ 세션 시작 시 필수
이 파일을 먼저 읽고 "## 진행상황"과 "## 남은 작업"을 확인할 것.
세션6까지 완료된 줄 알지 말고, 아래 진행상황의 최신 날짜·항목을 기준으로 이어갈 것.

## ★ 작업 완료 시 필수 (과거에 갇히지 않게)
git push로 작업을 배포할 때마다, 반드시 이 파일의 "## 진행상황" 맨 위에
한 줄을 추가하고(날짜+완료내용), 끝난 항목은 "## 남은 작업"에서 제거할 것.
이 갱신을 빼먹으면 다음 세션이 과거 상태로 시작되므로 절대 빠뜨리지 말 것.

## ★ 작업 중 끼어든 요청 처리 (삼천포 방지)
작업 도중 사장님이 다른 질문·요청을 하면:
1. 먼저 "지금 진행 중이던 작업"을 기억에 붙들 것 (절대 잊지 말 것).
2. 끼어든 요청이 급하면(버그·운영지장·즉답필요) → 그것부터 해결하고, 끝나면 "원래 OO 작업으로 돌아갑니다" 하고 복귀.
3. 끼어든 요청이 안 급하면(나중에 해도 됨) → "## 남은 작업"에 한 줄 추가만 하고, 현재 작업 계속 진행.
4. 단순 질문(코드수정 아님)이면 → 답만 하고 바로 원래 작업으로 복귀.
5. 매 응답 끝에 진행 중 작업이 있으면 "현재 작업: OO" 한 줄로 상기시킬 것.

## ★ 현재 진행 중 작업 (있으면 여기 기록, 끝나면 지움)
(없음)

## 진행상황 (최신이 맨 위 · push할 때마다 갱신)
- 2026-06-18 방송 위젯(product-widget) 자유 위치 드래그: 사장님 — 위젯을 화면 왼쪽에 바짝 붙이려는데 안 됨(카드가 left:24px 고정, OBS 풀스크린 소스라 자유 이동 불가). ProductWidgetClient 카드에 드래그 이동 추가 — pos state{x,y}+dragRef, onMouseDown=startDragWidget(window mousemove/up로 이동, 종료 시 localStorage 'ruru_product_widget_pos' 저장), 카드 style left/top=pos(없으면 기본 left:24/bottom:24 유지)+cursor:move+pointerEvents:auto(페이지 전체는 기존 pointerEvents:none 유지=OBS 캡처 방해 안 함). 토스트/컨페티는 기존 좌하단 유지(전환·주문 토스트·로테이션 로직 전부 무변경). ⚠️OBS에선 소스 우클릭→상호작용(Interact)에서 드래그해야 OBS localStorage에 저장됨(브라우저서 옮긴 위치는 OBS와 별개). 표시 전용·돈/주문 로직 무관. 검수 tsc 0에러+BANKDA 가드 통과. ⚠️미배포(로컬 build+push). DB변경 없음.
- 2026-06-18 상품관리 썸네일 클릭 확대(방송상품·쇼핑몰진열 탭): 사장님 피드백 — 방송 상품/쇼핑몰 진열 탭에서 썸네일 클릭해도 안 커져 상품 보기 어려움. AdminLiveProductManagePopup의 전체상품 탭(1335 setLightbox)·판매기록 탭은 이미 확대되는데 이 두 탭만 썸네일 span에 onClick 없었음. 두 탭 썸네일 span에 onClick={()=>img&&setLightbox(img)}+cursor zoom-in+title 추가(드래그 방해 안 되게 e.stopPropagation). 기존 lightbox 오버레이(fixed z-60) 그대로 재사용. 표시 전용, 돈/재고/주문 로직 무관. 검수 tsc 0에러+BANKDA 가드 통과. ⚠️미배포(로컬 build+push). DB변경 없음.
- 2026-06-18 입금패널/사이드패널/새로고침 UX 4건(돈·매칭 로직 무변경): 사장님 실사용 피드백. ①**입금매칭 패널 버튼 상단 이동+고정** — LiveFloatingMatchPanel 하단의 [선택 후 입금확인]/[금액 무시하고 수동확인]+선택합계 줄을, 매칭배너 바로 아래(헤더 flexShrink:0 영역)로 이동. 사이드패널 컨테이너가 max-h-[1000px] 고정이라 모니터보다 길어 하단 버튼이 화면 밖으로 밀리던 문제 해결(이제 스크롤해도 상단 고정). handleConfirmWithDeposit/handleConfirmWithoutDeposit onClick·매칭 API(/api/admin-v2/manual-payment-match, manual-payment-confirm-without-deposit) **그대로**. ②**오른쪽 사이드 패널 단일 슬롯 자동전환** — 주문상세 열 때 매칭패널 닫기(setMatchPanelOpen(false)+setSelectedOrderForMatch(null), onSelectOrder 2곳=테이블/빠른보기), 매칭 열 때 주문상세 닫기(onSelectForMatch에 setOrderDetailOpen(false)). 매칭 열린 상태에서 주문 클릭해도 안 바뀌던 문제 해결. openManualMatchForOrder는 원래 주문상세 닫음(유지). ③④**새로고침 시 필터·페이지 보존** — 앱 ↻/실시간 폴링(loadOrders)은 원래 filters/page 안 건드림 확인 → 증상은 **브라우저 F5**로 React 상태 초기화되는 경우. filters(Dashboard)·page(LiveOrderTable)를 **sessionStorage**에 보존(LIVE_ORDERS_FILTERS_KEY/PAGE_KEY, 기본값/1페이지면 removeItem=자동정리). 복원 시 didInitBroadcastFilter는 filtersRestoredRef로 기본값 덮어쓰기 스킵, setPage(1) 효과 2개는 mountedRef로 첫 마운트 스킵(복원 페이지 보존). 초기화 버튼(resetFilters)=기본값→저장삭제+page1로 자연 리셋. sessionStorage=세션 한정(새 탭/새날은 현재방송 기본값). 운영/돈 데이터 아닌 보기상태(기존 ruru_admin_sound_on localStorage·activeMenu URL 보존과 동일 관행). 검수 tsc 0에러+BANKDA 가드 2개+grep clean. ⚠️미배포(로컬 build+push). DB변경 없음.
- 2026-06-18 #3 3단계 UX보완(피커 모달화+옵션 정확화+삭제버튼 위치): 사장님 실사용 피드백 3건 반영. ①**사이즈 옵션 누락 수정** — 피커가 product_note.stock_variants만 읽어 size_options/sizes로 저장된 상품(예 뉴발 신발)의 사이즈가 안 떴음. 고객 주문페이지(app/order/page.tsx)의 옵션 읽기 로직을 그대로 이식: optionSuggestions(stock_variants + colors/color_options/product_colors/option_color/color, size 동일)+normEmpty(없음계열 제거)+optionMode(select/input/none, size_option_enabled·color_option_enabled 플래그). 색상/사이즈를 **field별 모드**로 렌더(select=칩 선택필수 / input=직접입력 / none=숨김). RPC엔 등록상품에서 읽은 옵션값 그대로 전달(재고 키 일치 유지). ②**피커를 큰 팝업(모달)로** — 좁은 380px 사이드바 인라인 → fixed inset-0 z-[120] 중앙모달(560px, 헤더+✕닫기+검색+상품목록 스크롤+옵션/수량/단가+하단 추가버튼). LiveOrderDetailDrawer가 onClose 전달. (드로어 ruruSidePanelIn 애니메이션 fill-mode 없음→모달 fixed 정상, 입금팝업 z-40과 배타분기라 충돌X). ③**삭제버튼 위치 이동** — 주문내역 카드 아래 별도 줄(세로폭 증가) 제거 → LiveOrderItemEditCard '수정' 버튼 옆으로(canDelete/deleting/onDelete props 추가, 기존 handleDeleteItem 연결 그대로). **돈/입금/정산/포인트/재고 RPC 로직 전부 무변경**(표시·입력수집·삭제호출 위치만). 검수 tsc 0에러+BANKDA 가드 2개 통과+grep clean. ⚠️미배포(로컬 build+push). DB변경 없음(SQL 2개는 이미 적용됨).
- 2026-06-18 #3 3단계: 등록상품 추가 피커 UI 신설(재고차감 RPC 연결): 다른 방에서 만든 admin_add_order_item RPC(등록상품 재고차감)가 SQL만 있고 프론트 호출이 없던 死코드였음 → 실제 UI 연결. **신규 LiveOrderRegisteredProductPicker.tsx** — products select(*)+status!=='deleted' 필터+상품명 검색(상위30)+썸네일(resolveProductImageUrl)+상품 클릭 선택. 선택 시 product_note.stock_variants 파싱: variant 있으면 옵션칩(색상/사이즈+재고수, 재고0=disabled) 선택 필수 / 없으면 '옵션없음'(총재고 또는 재고관리안함 표시). 수량+단가(상품 price 기본값, 수정가능). **핵심 안전장치**: 색상/사이즈는 자유입력 아니라 선택한 variant 객체에서 그대로 RPC로 전달 → 재고 키 불일치 원천차단. **useLiveOrderItemAdd.ts**에 addRegisteredItem 추가(LiveOrderRegisteredAddInput, admin_add_order_item RPC 호출, confirm·검증·res.ok 체크, 성공시 결과반환) — 기존 addDirectItem(직접입력 직접INSERT 경로)은 무변경. **LiveOrderDetailDrawer**: 주문내역 헤더에 [+ 등록상품 추가] 버튼 추가(직접입력 버튼과 상호배타 토글), showPicker 시 피커 렌더, handleAddRegisteredItem이 RPC 호출+성공시 localOrder.items 낙관적 append+onAfterStatusChange(직접입력과 동일 패턴). **돈/입금/정산/포인트 무관** — 재고차감·카드vat·그룹필드복사·재고부족검증·INSERT는 전부 RPC가 처리(택배비0·point_used0·입금확인된 주문은 금액↑시 입금확인취소 재매칭=기존 합의정책 동일). 검수 tsc 0에러+BANKDA 가드 2개 통과(next build는 샌드박스 swc 미설치로 로컬 실행 필요)+grep/import/연결 검수 통과. ⚠️미배포(로컬 build+push) + ⚠️Supabase에 admin_add_order_item_rpc.sql·admin_delete_order_item_rpc.sql 2개 실행해야 추가/삭제 동작(미실행시 'RPC 없음' 에러).
- 2026-06-17 #3 2단계: 주문상품 삭제 + 등록상품추가 RPC 작성: Supabase 재고함수(admin_update_inventory_linked_order_item) 전문·트리거·FK 확인 후 정석 구현. **신규 SQL 2개(Supabase 직접 실행 필요)**: ①admin_add_order_item_rpc.sql — 기준 행 복사로 그룹에 상품 추가(p_product_id null=직접입력 재고무관 / 값=등록상품 재고차감, 옵션=product_inventory_variants·총량=products.stock, inventory_ledger 기록, 재고부족시 raise, 카드 vat=그 주문 수수료율 동일공식). ②admin_delete_order_item_rpc.sql — 주문상품 1줄 삭제(등록상품=재고복구 후 하드삭제 / 직접입력=그냥 삭제). 가드: 그룹 마지막1개·포인트사용 항목은 삭제금지(주문취소 유도). FK 확인됨(order_items CASCADE/money_logs CASCADE/status_logs SET NULL, inventory_ledger는 orders FK 없음)→하드삭제 안전. **UI**: LiveOrderDetailDrawer 주문내역 각 항목에 [🗑 이 상품 삭제] 버튼(취소아님+2개이상일때, useLiveOrderItemDelete→admin_delete_order_item RPC, 성공시 localOrder.items에서 제거+onAfterStatusChange). 입금내역/정산/포인트 무변경(금액↓시 입금확인취소로 재매칭=합의). DELETE는 orders UPDATE 트리거(포인트)와 무관. 검수 tsc 0에러+가드 통과. ⚠️미배포(로컬 build+push) + ⚠️Supabase에 SQL 2개 실행해야 함(삭제RPC 미실행시 삭제버튼 동작 안함). ※등록상품 선택추가 UI(피커)는 add RPC 위에 다음 단계로 붙임(현재 직접입력 추가는 기존 JS 경로 유지).
- 2026-06-17 주문상세 주문내역 내부스크롤 제거(정정): 사장님 본래 요청=주문내역 영역 자체 내부스크롤 없애고 주문상세 패널 본문(min-h-0 flex-1 overflow-y-auto)이 통째로 스크롤. 이전에 max-h-[240px]→[480px]로 잘못 반영했던 것을 LiveOrderDetailDrawer 주문내역 리스트 div `max-h-[480px] overflow-y-auto pr-1` → `space-y-2`로 변경(내부 스크롤 제거). 로직 무관, UI만. tsc 0에러+가드 통과. ⚠️미배포(로컬 build+push).
- 2026-06-17 #3 1단계: 주문상세 직접입력 상품 추가(재고 무관) 신설: 신규 useLiveOrderItemAdd.ts — 기존 주문(LiveOrder)의 첫 행(order.rowIds[0])을 select * 로 읽어 그룹 공유필드(SHARED_KEYS: created_at·order_group_id·order_lookup_code·broadcast*·youtube_nickname·customer_name/phone·recipient*·주소·payment_method·카드수수료율·order_status/admin_status/order_manage_status/admin_order_status_v2/shipping_status·exclude*·customer_id) 복사 + 직접입력 항목값(product_id=null→재고 무차감, product_name/color/size/qty, product_price=단가, adjusted_product_price=상품금액, shipping_fee/adjusted_shipping_fee=0[택배비 중복방지], vat_amount=카드면 round(상품금액×customer_card_extra_rate_applied/100) else 0[submit route 130~137 동일 공식·그 주문 수수료율], total_price/adjusted_total_price/final_amount=상품금액+vat, memo, 선택컬럼 actual_card_fee_amount/point_used_amount=0/point_original_amount는 첫행에 있을 때만)으로 orders INSERT. LiveOrderDetailDrawer 주문내역 헤더에 [+ 직접입력 추가] 토글 버튼+인라인 폼(상품명/색상/사이즈/수량/단가)+추가 시 localOrder.items 낙관적 append+onAfterStatusChange. created_at 복사로 주문일 안 튐. **입금내역(deposit_confirmed_at)/포인트차감/정산/자동매칭/재고 RPC 무변경** — 추가행은 그룹 상태 그대로 복사라 입금판정 일관, 금액↑시 운영자가 입금확인취소로 재매칭(합의 정책). 고객 주문조회는 같은 order_group_id/lookup_code라 자동 반영(#4 추가분 충족). 검수 tsc 0에러+BANKDA 가드 통과+금액시뮬 10/10(무통장/카드 vat·반올림·총액). ⚠️미배포(로컬 build+push). DB변경 없음. ※2단계=상품 삭제(재고 복구 RPC 정의 확인 후), 3단계=등록상품 추가(재고 차감 RPC) 남음.
- 2026-06-17 [긴급] 상품관리 팝업 삭제(숨김) 실패 수정: 증상="삭제"→"상품 숨김 처리 실패 [object Object]" 토스트, 숨김 안 됨. 원인=AdminLiveProductManagePopup.deleteProduct가 `update({status:"deleted", is_visible:false})`로 직접 update했는데 is_visible 컬럼이 없으면 update 전체 실패(앱 다른 곳은 insert/updateProductSchemaSafe로 없는 컬럼 자동 제거 후 재시도하는데 이 핸들러만 미경유), 게다가 throw한 supabase 에러객체를 `String(e)`로 찍어 [object Object]로 표시됨. 해결=숨김 마커는 status="deleted" 하나로 충분(관리자 목록 645/679/1498 status==="deleted" 제외 + 고객 app/order 1823/2695 status!=="deleted" 제외 양쪽 확인) → `update({status:"deleted"})`만 실행(is_visible 제거로 실패원인 차단), 에러도 error.message 표시. 돈/입금/정산/배송/재고/RPC 무관(상품 표시 전용). 검수 tsc 0에러+BANKDA 가드 통과. ⚠️미배포(로컬 build+push). DB변경 없음.
- 2026-06-17 [긴급] 상품등록 막힘 + 고객 카테고리 "음식" 누락 수정: ①증상=방송모드/쇼핑몰모드 선택 UI 삭제 후 방송 OFF 상태에서 새 상품 등록 시 "방송상품은 방송 시작 후 등록할 수 있습니다" 경고로 막힘. 원인=QuickProductFastForm.saveProduct의 resolvedProductType이 신규=항상 "broadcast" 고정(773~776)→789 차단. 해결=신규는 activeBroadcastId 있으면 "broadcast"(방송상품), 없으면 "group_buy"(상시판매)로 등록(수정모드는 기존 타입 보존 그대로, 기존 group_buy 17개 보호). 방송 ON이면 종전대로 broadcast_products 연결. ②증상=등록폼은 커스텀 카테고리(음식) 추가 가능한데 고객 주문페이지(app/order/page.tsx) 카테고리 탭이 ["전체","의류","신발","잡화"] 하드코딩이라 "음식" 탭 없음. 해결=categoryFilter state 타입 string으로 완화 + 탭을 quickGroupBuyProducts의 실제 product_note.category에서 동적 생성(PRESET 의류/신발/잡화 유지 + 커스텀은 정렬해 뒤에 자동 추가), 탭 컨테이너 flexWrap. 필터 판정 로직(cat===categoryFilter) 무변경. **돈/입금/정산/배송/포인트/RPC 전부 무관(상품등록·표시 전용)**. 검수 tsc 0에러+BANKDA 가드 통과+시뮬 9/9(타입결정·차단·카테고리탭). ⚠️미배포(로컬 build+push). DB변경 없음.
- 2026-06-17 라이브 출고완료 처리/해제 기능 신설(송장출력→출고완료→고객 주문조회 반영 버그 해결): 증상=라이브(/admin-live)에서 송장 출력해도 고객 주문조회에 '출고완료'가 안 뜸. 원인(근거확인 완료)=라이브 "🚚 송장 출력"(LiveOrderTable runExport→exportLiveOrdersForRosen)은 **엑셀 내보내기만** 하고 상태를 안 바꿈. 출고완료 반영은 admin-v2의 로젠 재업로드("1차 출고완료 반영")에만 있어, admin-v2를 안 쓰면 출고완료가 영영 안 찍힘. 추가로 라이브 "출고완료" 칩·'출고'칼럼·counts.shipped가 order.shippingStatus를 읽는데 어댑터가 안 채워 **항상 0/"-"인 미완성 표시**였음. 해결(신규 useLiveOrderShipped.ts, 취소/복구 훅과 동일 안전패턴): 선택 주문 일괄 **출고완료 처리**(결제완료+미취소만 대상, admin_order_status_v2/order_manage_status="출고완료"+shipped_at 최초1회만 기록=기존값 보존 .is shipped_at null) / **출고완료 해제**(현재 출고완료 행만 .eq 가드로 "출고대기" 환원+shipped_at=null). LiveOrderTable에 선택>0일 때 [📦 출고완료 처리][↩ 출고완료 해제] 버튼(송장출력 옆), 성공 시 선택해제. liveOrderAdapter에 shippingStatus=배송단계값만(출고대기/출고완료/킵/픽업) 노출→'출고'칼럼·칩·counts 정상화(표시 전용). types.ts LiveOrder.shippingStatus 추가. **돈/입금/정산/포인트/Bankda/RPC/자동매칭 전부 무변경** — "출고완료"·"출고대기"는 PAID_STATUS_VALUES 포함이라 결제완료 판정 안 깨짐(어댑터 getPaymentStatus 확인). 고객반영 경로 확인: order_manage_status="출고완료"→getCustomerOrderStatusLabel="배송출발"→MyOrderResultCard deliveryStatus="출고완료". 검수 tsc 0에러 + BANKDA 가드2개 통과 + 순수로직 시뮬 14/14 통과. 1차 배포완료(3b0d3cd). admin-v2 무변경(보존).
- 2026-06-17 출고완료 2차 보완(입금배지 보존+직전상태 복원+출고칸 줄바꿈): 1차 배포 후 사장님 피드백 — ①출고완료/해제하면 입금배지가 "자동입금확인→입금확인"으로 바뀜(요청 안 함) ②출고칸 "출고완료/출고대기" 글씨 줄바꿈 ③출고완료33 기준?. 원인=orders에 배송상태 전용칸 없음→admin_order_status_v2/order_manage_status 한 칸이 입금확인→출고대기→출고완료로 단계 진행(admin-v2도 동일 구조). 출고완료로 올리면 자동/수동입금확인 구분이 그 칸에서 사라져 일반 입금확인으로 표시되고, 1차 해제는 "출고대기"로 고정복귀라 원래 입금상태 미복원. 출고완료33=예전 admin-v2 로젠재업로드로 이미 DB가 "출고완료"인 기존주문(신규생성 아님), 1차에서 shippingStatus 살리며 비로소 표시됨. 해결(추천안=직전상태 보존): **DB** orders ADD COLUMN shipped_prev_status(orders_shipped_prev_status.sql, ADD only). **useLiveOrderShipped** 출고완료 처리 시 현재 상태 조회→직전 입금상태를 shipped_prev_status에 보관(이미 출고완료/보관값 있으면 보존), 해제는 현재 출고완료 행만 직전상태로 복원(없으면 출고대기 fallback)+shipped_prev_status=null+shipped_at=null. **liveOrderAdapter.getPaymentStatus** 현재상태가 배송단계(SHIPPING_STAGE_STATUSES)고 shipped_prev_status 있으면 basisRow(상태=직전값)로 입금 배지 판정→자동/수동입금확인·카드결제완료 보존(직전값 없는 기존데이터는 기존동작 그대로=회귀0). **LiveOrderTable** 출고칸 badge whitespace-nowrap+px-1+출고완료 파랑(줄바꿈 해결). **돈/입금내역(deposit_confirmed_at)/정산/포인트/자동매칭 무변경** — shipped_prev_status는 표시·복원 전용. 검수 tsc 0에러+BANKDA 가드2개+시뮬 10/10(자동/수동/카드 보존·복원, 기존33 회귀0, 재처리 보관값보존) 통과. ⚠️미배포(로컬 `npm run build` 후 push) + ⚠️Supabase에 orders_shipped_prev_status.sql 실행해야 보존 동작(미실행시: 출고완료는 되나 입금배지 일반화·해제는 출고대기 fallback). ※1차에서 이미 해제했던 테스트주문은 직전상태 미기록이라 출고대기로 남음(기능상 결제완료 유지, 필요시 수동조정).
- 2026-06-16 받는사람(배송) ↔ 주문자(입금/포인트) 분리: 증상=배송지 시트에 받는 분·연락처를 입력받는데 주문엔 안 쓰이고 배송지 바꿔도 이름·전화 안 따라감(주소만 바뀜). 원인=orders에 받는사람 칸이 없어 customer_name/phone(=주문자)이 배송 받는분까지 겸함+onSelectShippingAddress가 customerName/phone 세팅했다가 closeCustomerInfoEditBottomSheet가 되돌림. 해결(표준 쇼핑몰식 주문자/받는사람 분리): **DB** orders ADD COLUMN recipient_name/recipient_phone(orders_recipient_columns.sql, ADD only). **order/page** recipientName/recipientPhone state 신설→applyCustomerFromRow·loadCustomerByNamePhone가 기본배송지 받는분/연락처로 세팅(없으면 주문자 fallback), onSelectShippingAddress는 이제 받는사람만 갱신(주문자 customerName/phone 불변), 주문서확인 카드 받는분/연락처=받는사람 우선, 제출 body에 recipient_name/recipient_phone 추가. **submit API**(app/api/customer-orders/submit/route.ts) RPC 무변경 유지+제출 직후 order_group_id로 recipient만 best-effort UPDATE(실패해도 주문 성공). **송장/엑셀**(adminLiveOrderExcelExport recipientName/phoneText, liveOrderAdapter recipientName/Phone 매핑, types.ts LiveOrder 필드) 받는분=recipient 우선·없으면 닉네임/주문자 fallback(옛주문 호환, 닉네임은 주소칸 /닉네임으로 유지). **입금자동매칭(닉네임 or customer_name)·포인트(customer_phone)·RPC 전부 무변경** — 주문자 기준 보호. 검수 tsc 0에러+시뮬3(선물배송 받는사람반영&주문자불변&입금매칭정상&송장정우성/본인배송/옛주문닉네임fallback) 통과. ⚠️미배포(빌드+push 필요) + ⚠️Supabase에 orders_recipient_columns.sql 실행해야 recipient 실제 저장됨(미실행시 송장은 기존 닉네임 fallback로 안전).
- 2026-06-16 직접입력 미완성항목 주문막힘 버그 수정(app/order/page.tsx): 증상=주문서 확인에 "아디"(직접입력·0원·수량0) 같은 유령 항목이 남아 제출 시 "수량을 입력해주세요"로 막힘. 원인=①직접입력창은 글자치는 즉시 items에 저장(상품명 onChange 4779)되는데 X로 닫아도(closeDirectInputSheet) 미완성 항목을 안 지움 ②카트/확인 화면에 삭제버튼이 아예 없음(removeItem 정의만 있고 미연결) ③`수량 {toNumber(qty)||1}개`라 빈 수량이 "1"로 보여 사용자 혼동(실제 검증 3141은 qty 없으면 차단). 수정: ①confirm 카드 각 상품에 ✕삭제버튼 추가(removeItem 연결, 비면 emptyItem 1개 유지) ②closeDirectInputSheet에서 미완성(상품명/수량/금액 누락) 직접입력 항목 자동 정리(완성·등록상품 product_id는 보존, 확정은 setDirectInputOpen(false) 직접호출이라 정리와 무충돌) ③수량 표시를 실제값으로(0이면 빨강), itemAmount도 실수량 사용. 돈/입금/정산/배송/포인트/RPC 무변경, UI만. 검수 tsc 0에러. 미배포(빌드+push 필요). ※배송지 "변경" 시 주소는 바뀌지만 받는분 이름·연락처가 안 따라가는 건 의도(customer_name/phone=주문자=입금/포인트 매칭 기준 보호). 받는사람 분리 반영은 입금매칭/송장 영향이라 별도 설계 필요(미진행).
- 2026-06-16 주소 일원화 Phase4(flat↔JSON 단일화, DB 트리거): 감사결과 남은 유일한 주소 리스크=주소 저장소 2원화(customers.address flat vs shipping_addresses JSON)로 배송지 시트 수정 시 JSON만 갱신·flat 잔존 → 관리자 회원상세 "📍주소" 한 줄만 옛값(※실제 송장/엑셀은 orders 스냅샷 사용이라 배송사고 무관, 손님화면은 JSON우선이라 정상). 해결=shipping_addresses(JSON)를 진실원천으로 단일화 + flat은 DB 트리거가 항상 기본배송지로 자동 미러. supabase/sql/customers_address_sync_trigger.sql — 함수 ruru_sync_customer_address()+트리거 trg_sync_customer_address(BEFORE INS/UPD): JSON 비어있지않으면 flat=기본배송지(isDefault>첫항목, 빈주소면 flat 유지), JSON없고 flat있으면 flat→JSON seed(phone 하이픈 포맷). 본문 전체 exception 삼킴→customers 쓰기(주문제출 등) 절대 안 막음=제출 위험0. 앱 코드 무변경(순수 DB). 기존 678행 `update customers set address=address`로 일괄 동기화. 운영 적용완료, 검증 주소있는데JSON없음0/flat↔JSON불일치0(id=742 빈JSON기본 1건은 flat주소로 JSON 채워 해결). customers_backup_20260616_p4 백업존재. ⚠️트리거 .sql은 기록용 커밋만(DB 이미 적용, 배포 불필요).
- 2026-06-16 주소 버그 근본해결 Phase1-2(카카오 로그인 후 배송지 뒤바뀜/누락): 진짜 원인=전화번호 포맷 불일치로 customers row 중복(주문 RPC는 숫자만 저장, 클라/login-sync는 하이픈 저장) + flat/JSON 분산 + 쓰기키 split-brain. 실측: customers 883건중 중복 205그룹·410row, flat주소만 789건, orders.customer_id 226·deposits.match_customer_id 1(FK 둘다 NO ACTION). **Phase1(DB, Supabase 적용완료)**: supabase/sql/customers_dedup_normalize_phone.sql — 원자적 DO블록으로 같은사람(숫자기준) 중복을 canonical 1개로 병합(canonical=kakao>주소>JSON>최근주문>먼저생성 순, 빈칸만 보충·주소는 한 row 통째·non-null 보존·is_blocked는 text'true'면 차단유지), orders/deposits 참조 canonical로 repoint 후 중복삭제, 전 row customer_phone 숫자만 통일. 결과 883→678(205제거), 남은중복 0. customers_backup_20260616 백업존재. **Phase2(코드)**: app/order/page.tsx의 loadExistingCustomerByKakaoPhone·loadCustomerByNamePhone·saveCustomer·saveShippingAddresses 4곳 + app/api/customer-login-sync/route.ts insert 1곳을 customers 조회/쓰기 키를 onlyNumber(숫자만)로 통일(표시·localStorage는 normalizePhone 하이픈 유지). 돈/입금/정산/배송/포인트/RPC 무변경. 검수 tsc 0에러 + 코드로직 시뮬 4시나리오 통과(A기존고객매칭/B신규중복0/C회귀증명/D혼합입력단일키). **배포완료(7ae26de)**. 운영DB 재확인 총678/숫자만678/비숫자0/중복0/주소있는row659. **STAGE3 unique 제약(customers_customer_phone_key) 적용완료** → 같은 전화번호 중복 물리적 차단(재발방지 완료). **Phase3 적용완료**: 타이밍 땜질 2개 제거 — callback 1800ms→800ms 환원, loadExistingCustomerByKakaoPhone의 빈배열 700ms retry 제거(+retryCount 파라미터 제거, 호출부 3곳 1-arg 정상). localStorage 주소 직접전달은 진실원천 이중화라 채택 안 함(DB 단일 row 유지). 검수 tsc 0에러. ※진짜 원인은 login-sync 라우트의 별도 normalizePhone만 하이픈이었음(order페이지 normalizeOrderPhone은 원래도 숫자만). **Phase3 배포완료(f6a6a20)**.
- 2026-06-16 방송 선택을 달력(캘린더) 방식으로 교체: 기존 방송 드롭다운(쌓이면 2년치 쭉 나옴)을 사장님 요청대로 달력 팝업으로. 신규 컴포넌트 BroadcastCalendarPicker.tsx — 방송 있는 날에 딥로즈 점·하루 2개+면 우상단 개수배지, 날짜 클릭 시 onPick(broadcastId)→scope=broadcast+broadcast=그방송(여러개면 아래 리스트로 고르기), 헤더 ‹달›› 이동+"전체 방송 보기" 버튼, 처음 보일 달=선택방송>최근방송>이번달. 날짜키는 부모에서 getAlwaysOrderDateKey(KST)로 변환해 전달(TZ버그 회피). LiveOrderTable: scope===broadcast일 때 BroadcastSearchSelect 대신 BroadcastCalendarPicker 렌더(import 교체, broadcastCalendar prop 추가). AdminLiveDashboard: broadcastCalendar useMemo(broadcasts→{id,dateKey,label}) 신규+prop 전달. ※중간에 시도했던 "기간 내 방송 칩 줄"은 사장님이 '2년치 쌓임 싫다' 해서 폐기(미배포). 돈/입금/정산/matchScope·matchBroadcast 무변경. 검수: tsc 0에러, 돈판정 diff 무변경. ⚠️next build 샌드박스 swc 미설치로 미실행(로컬/CC 빌드 필요). 미배포(커밋대기)
- 2026-06-16 주문서 필터 5칸→3칸 재설계(기간/범위/상태): ①날짜축 — LiveOrderDateFilter에서 `yearmonth` 제거·`lastmonth`(지난 달) 추가, `custom` 라벨 "직접 선택"→"기간 선택", filterYear/filterMonth 필드 완전 제거(타입·DEFAULT_FILTERS·resetFilters·라벨맵·useMemo deps). matchesDate에 lastmonth(전월 1일~말일, 1월=작년12월 연경계 처리) 구현. ②범위축 신규 — LiveOrderFilters에 `scope: "all"|"broadcast"|"shop"` 추가. filteredOrders에 matchScope **레이어만 추가**(all=제한없음/broadcast=상시제외/shop=상시만, isAlwaysOrderLike 기준), 기존 matchBroadcast·isPaid·matchesStatus 돈/방송 판정 **무변경**. ③UI(LiveOrderTable) — 방송 단일 드롭다운(방송+상시날짜 뒤섞임)을 [기간][범위][상태] 3칸으로. 범위=방송일 때만 BroadcastSearchSelect 노출(상시:always 옵션 제외 + hideShopOption prop으로 하단 공구·상시 버튼 숨김). 범위 비-방송 전환 시 broadcast="all" 리셋(빈화면 방지). ④needsFullLoad에 lastmonth·custom 추가(과거 범위 500건 캡 누락 방지). ⑤첫로드 방송중 기본=scope:broadcast+broadcast:current. 검수: tsc 0에러, BANKDA 가드 통과, 돈판정 diff 무변경 확인, lastmonth/scope 시뮬 전수통과. 로컬 next build 통과(BANKDA 가드+Compiled OK, 정적 34페이지 생성). 배포 완료
- 고객 하단바: "담은상품 N개·확인하기" 1버튼 통합, 제출은 주문서 확인 시트 내부에서만 (a70d8d5). 0개시 비활성.
- 2026-06-09 세션18(재고 key 불일치 버그 수정): QuickProductFastForm.tsx buildVariantRows(203~220) key 생성을 로드(636줄)와 동일 형식으로 통일 — 210줄 `${color}__${size}` → `${color || "__EMPTY_COLOR__"}__${size || "__EMPTY_SIZE__"}`. 기존엔 색상·사이즈가 둘 다 빈문자열인 변형(variant)의 경우 로드 key(__EMPTY_COLOR____EMPTY_SIZE__)와 재생성 key(__)가 불일치 → previousMap 미스 → 저장/재고편집(updateVariantStock 738) 시 해당 재고 0으로 유실. 이제 로드(636)·재생성(210)·편집핸들러(738) 3곳 key 일관. 없음 sentinel은 truthy라 영향 없고, 진짜 빈옵션만 해당. 돈/입금 로직 무관(657e20c)
- 2026-06-09 세션18(상품목록 SOLD OUT 업계표준): app/order/page.tsx 상품목록 카드 — ①SOLD OUT 오버레이 표시조건 isSoldOutOrderProduct(product)→sold(버튼 disabled/품절라벨과 동일기준 통일) ②오버레이 스타일 업계표준화(bg rgba(0,0,0,0.55)+flexDirection column, SOLD OUT 폰트 11px/letterSpacing 0.1em) ③카드 전체 opacity(sold?0.5:1) 제거→항상1(오버레이로 충분). 돈/입금/정산/배송 로직 무변경, UI만(47d31cd)
- 2026-06-08 세션17(공지배너+직접입력 토글+주문취소 조회): ①주문조회에 "주문취소" 상태 추가(CustomerOrderLookupBottomSheet 타입+빨강배지#C0392B+필터그리드 repeat(filters.length), order/page ORDER_LOOKUP_FILTERS+ruruOrderLookupStatusLabel 취소 최우선판정 payment_status canceled 포함 관리자 정합)(4a4668e). ②TopCustomerNav 헤더 목업교체 — 루루동이+👋닉네임님!(좌)+☰메뉴보기(우)만, 담은상품버튼 헤더서 제거(하단바 유지), 딥로즈#7A1E47. ③손님 주문페이지 settings 연동: noticeText/directInputEnabled state+loadOrderSettings 조회. TopCustomerNav 아래 공지배너(비면 숨김, bg#F9EEF3 좌보더3px#7A1E47), 직접입력버튼 문구"+상품을 못 찾으셨나요? 직접 입력하기"+directInputEnabled=false면 숨김. ④AdminLiveSettingsPanel "주문서 공지/직접입력" 카드(공지 textarea + 직접입력 ON/OFF 토글, settings notice_text/direct_input_enabled upsert, NumericSettingKey 분리). 돈/입금/주문제출 로직 무변경(9246da8). ⚠️settings에 notice_text/direct_input_enabled 행 없으면 기본값(빈공지/직접입력ON)
- 2026-06-08 세션17(카카오ID저장+변경이력): customer-login-sync route — insert에 kakao_id/kakao_nickname/first_login_at/last_login_at, update에 kakao_id보완·nickname갱신·last_login_at항상갱신, customer_history 변경기록(name/address/detail 채워질 때 {field,old,new,changed_at} append)(b3eb1d3). 회원상세(AdminLiveCustomersPanel) 카카오정보+로그인시각+변경이력 표시, selectedProfile 전화매칭(5e95c0e). ⚠️add_customers_kakao_columns.sql + customer_history(jsonb) 컬럼 Supabase 적용 필요
- 2026-06-06 세션16(주문서 배지·입금매칭 리스킨 + 가드): ①닉네임 클릭→주문상세 드로어는 이미 연결돼 있음(onSelectOrder→setOrderDetailOpen→LiveOrderDetailDrawer), 변경 불필요. ②LiveOrderTable 상태배지 시안① 팔레트 인라인(입금확인green/매칭필요amber/대기·미결제red/취소muted/카드완료blue), 상태칩(전체/입금대기/입금확인/주문서취소)은 이미 딥로즈+로직 그대로(8cd4dec). ③입금매칭(admin-v2) 시안⑧ 추가 리스킨: 헤더 '⇄ 입금매칭' 딥로즈+확정버튼 slate→녹색, 매칭 로직 무변경(9a5b82d). ④금지사항에 'LiveOrderTable 임의 전체교체 금지·최소수정만' 추가. ⑤룰렛 자동지급 중복가드(5a235d5)
- 2026-06-06 세션16(시안 화면 교체 다건 + 주문 realtime): ①주문서 실시간 새로고침 버그수정(907d1de) — useAutoBankdaPaymentSync가 매 폴링마다(successCount 0이어도) onSynced+window이벤트로 loadOrders 2번 호출해 주문표 계속 리셋되던 것을, onSynced는 detail.successCount>0일 때만 loadOrders + window핸들러는 입금내역만 + supabase realtime orders INSERT/UPDATE 구독→디바운스 loadOrders 추가(새주문 즉시반영). BANKDA setInterval·가드 무변경. ②회원상세(CustomerDetailDrawer) 시안⑥ 중앙모달 딥로즈(59d1189). ③정산(admin-v2 SettlementMoneyFlowDashboard) 리스킨 파랑→딥로즈, 계산·방송별테이블·연월필터 유지(0e77d6b). ④설정 입력 포커스링 딥로즈(f408179). ⑤입금매칭(admin-v2 ManualPaymentMatchDrawer) 검색/새로고침 파랑→딥로즈, 매칭로직 무변경(b2fc232). ※admin-v2는 사장님 명시 허용. ⚠️포인트 일괄지급(시안⑩)은 빈 placeholder=신규기능이라 이번 건너뜀(별도 spec 필요)
- 2026-06-06 세션15(이벤트 입금완료 필터 서버연동·P2): app/api/admin-live/event-roulette/route.ts handleParticipants가 paidOnly 파라미터 읽어 buildParticipantsForRequest(…,paidOnly) 전달 → paidOnly면 주문 rows를 admin_order_status_v2/order_manage_status가 자동입금확인·수동입금확인·카드결제완료인 것만 필터 후 참가자 구성(isPaidOrderRowForRoulette). 기존엔 서버가 paidOnly 무시해 전체와 동일했음. buildRouletteparticipants(import)·추첨/포인트 로직 무변경. PUSH 0b30e29
- 2026-06-06 세션15(당첨자 목록 종류뱃지): AdminLiveEventRoulettePanel 당첨자행에 🎡룰렛/🪆인형뽑기 표시 — winners엔 종류정보 없어 w.event_id로 events 매칭→overlay_token 접두사(roulette/claw) 판별, 매칭실패 시 "이벤트". 프론트 표시만. PUSH 7d1731a ※events 응답이 과거 당첨자 이벤트 다 포함 안하면 "이벤트"로만 뜸 → 그땐 winners API에 종류 내려주기 보강 필요
- 2026-06-06 세션15(고객정보 중복row 재발방지): app/order/page.tsx saveCustomer가 customer_phone으로만 조회/갱신해 번호변경 시 새 row INSERT(중복 원인 — 471/475 같은). saveCustomer(previousPhone?) 추가 → lookupPhone=옛번호≠새번호면 옛번호로 조회/update(customer_phone을 새번호로 갱신). 정보수정 호출(2374)만 customerInfoEditSnapshot?.customerPhone 전달, 주문제출(3037)·돈로직 무변경. sed 다중매칭(cleanPhone 7곳) 위험 회피 위해 Edit으로 saveCustomer에만 적용
- 2026-06-06 세션15(적립률 소수점·소급 1.5%): 설정 적립률칸 소수점 허용(공유 SettingInput에 선택 props type=number step0.1 min0 max100 inputMode=decimal만 추가, 기존 칸 무변경 / decimalInput 핸들러로 onlyDigits 대체 → 1.5 입력가능). 소급적립 SQL(order_point_backfill_today.sql) 적립률 고정 1.5%(=15/1000 bigint 정수연산, 설정값 의존·v_rate 제거). PUSH d5e2ceb
- 2026-06-06 세션15(포인트 자동적립): 설정에 "포인트 적립 규칙" 카드(자동적립 ON/OFF 토글 + 적립률 입력, settings.point_auto_earn_enabled/point_earn_rate, 적립률 소수점 허용 type=number step0.1). 결제완료(자동·수동 입금확인/카드결제완료) 시 자동적립 = DB 트리거 SQL(supabase/sql/order_point_auto_earn_rpc.sql, 별도 적용 — 입금 JS 무수정, 상품금액(택배비제외)×률, 1주문1회 point_earned_at, 포인트사용/테스트/정산제외 주문 제외, 선물팝업 미표시 customer_seen_at=now). 주문서 멘트 "구매금액 N% 적립"/OFF숨김(OrderPriceSummaryBox pointEarnRate prop). 오늘건 소급적립 SQL(order_point_backfill_today.sql, 1.5% 고정=15/1000, 1단계 미리보기+2단계 DO). orders ADD COLUMN point_earned_at/point_earned_amount. 돈/입금/매칭 로직 무변경. ※SQL 2개는 Supabase SQL Editor 직접 실행 필요
- 2026-06-06 세션15(위젯 실시간 토스트·버그2건): components/product-widget/ProductWidgetClient.tsx — 주문(orders INSERT)/입금확인(자동·수동, admin_order_status_v2·order_manage_status가 ~'입금확인')/카드결제완료 UPDATE 4종 실시간 토스트, **큐 방식**(order_group_id 중복방지, 상단 딥로즈 반투명 3초 순차). 버그수정2: ①금액 0원 → amount()가 total_amount만 읽던 것을 **final_amount(=total_price/adjusted_total_price) 우선**으로(submit route 실제 컬럼) ②토스트 안사라짐 → 큐 useEffect가 [currentToast,toastQueue] 의존이라 표시직후 재실행으로 setTimeout 즉시clear됨 → **표시 effect와 자동숨김 effect([currentToast]만) 분리**. 옵션 색상만 표시(colorsOf, 사이즈 제거). 카드 크기 280px로 적당히 축소(이미지72/상품명14/가격16). 투명배경 유지
- 2026-06-06 세션15(상품카드 이미지 버그): app/order/page.tsx loadBroadcastProducts 매핑이 image_url/main_image_url/thumbnail_url을 누락 → quickGroupBuyProducts dedup([...catalog,...broadcast]→Map)에서 broadcast가 catalog를 덮어써 이미지 빈칸. **broadcast 매핑에 image_url=pickOrderProductImageUrl(product) 추가**로 수정(이미지 표시만, 주문/돈 로직 무변경). ※여전히 안뜨면 image_url이 전체URL 아닌 스토리지 경로인 경우 — 경로→URL 변환 추가 필요
- 2026-06-06 세션15(카드결제 팝업 최종): components/admin-live/AdminLiveCardPayPopup.tsx — 최종형 = 좌(복사4칸 패널)+우(페이스터 iframe) 좌우 960px. **window.open 별도창 완전 제거**(openPaysterRightHalf no-op로, LiveOrderTable import 호환 유지). handleComplete(카드결제완료 상태변경) 로직 무변경. ⚠️페이스터(user.service.payster.co.kr)가 iframe 임베드 차단(X-Frame-Options/CSP)하면 우측 빈화면 → 그 경우 window.open 방식 복귀 필요(검증 대기)
- 2026-06-06 세션14(고객 order page P1): app/order/page.tsx(4664줄) 상단바를 손님페이지 시안(/Users/ruru/Downloads/files/루루동이_손님페이지_위젯_통합본.txt)대로 딥로즈 1:1 인라인 교체 — 루루동이+LIVE배지(방송ON시)+주문서아이콘(담은개수 cartCount 배지)+☰. ☰→메뉴 바텀시트(주문조회/정보수정/내포인트/유튜브·카톡·밴드·인스타 링크 placeholder, 기존 openOrderLookup/openCustomerInfoEdit 핸들러 재사용). MENU_ITEM_STYLE 모듈상수. 주문제출/돈/포인트 로직 무변경. ※order page는 섹션별 증분(P2 주문방법~P10 위젯)
- 2026-06-06 세션13-2(상품 시안 P2): 새 상품 등록 폼(QuickProductFastForm) 시안③ 인라인 1:1 교체(560px 중앙모달, .ruru-product-sian). 드로어(AdminLiveQuickProductDrawer)는 우측 aside/헤더 제거→폼만 렌더(모달 본체=폼). 배송구분 select normal/vendor/vendor2(=업체배송1/2), 상품종류 broadcast/group_buy(방송상품/상시판매), 방송화면 캡처=UI버튼+토스트(기능없음), 옵션4줄(색상/사이즈+프리셋/수량/금액)+재고관리·고객노출 토글. 저장로직(saveProduct/insertProductSchemaSafe/broadcast_products/combine_shipping 등) 100% 보존, 렌더만 교체. ※combine_shipping은 vendor만 N(미변경) — vendor2 합배송 처리 필요시 별도
- 2026-06-06 세션13(상품 시안 P1·P3): 상품관리 팝업(AdminLiveProductManagePopup) 시안② 인라인 1:1 교체(.ruru-product-sian 스코프 globals.css, 560px 고정) + 순환/고정 모드 토글(순환=broadcast_products insert 기존, 고정=products.is_pinned update 기존고정해제후 선택고정). 지금띄운상품 패널(LiveBroadcastPanels): 고정상품 있으면 1개, 없고 순환 있으면 broadcast_products 목록 나열, 둘다없으면 안내(activeBroadcastId prop 추가, 상품변경 이벤트 갱신). 돈/배송 로직 무변경. ※P2 잔여=QuickProductFastForm(③ 새상품등록, 1244줄) 시안 인라인 이식 — 저장로직 보존 위해 별도 정밀 패스 필요
- 2026-06-06 세션12-2(중복당첨 토글 연동): event-roulette API의 중복당첨 방지(applyNoDuplicateWinnerRule, 666 "이미 모든 참여자 당첨" 에러)를 excludeDailyDup으로 게이트 — false면 중복체크 건너뜀(handleParticipants searchParams + createEvent body 둘 다, 기본 true). 패널이 "당일 중복당첨 금지" 토글값을 create_event 3곳 + 참가자GET에 전송. 돈/포인트/추첨 로직 무변경
- 2026-06-06 세션12(이벤트 4건): 당첨자 카드=overlay result-card 디자인 정밀화 / 룰렛 회전 30바퀴 / 인형뽑기 탭=canvas 숨기고 🕹️인형UI 표시(버그수정) / 당첨 확정 시 giftType=point+금액 있으면 **포인트 자동지급**(운영모드만, orders 최신주문 customer_phone로 닉네임→전화 매핑, 기존 /api/admin-live/customer-points API 재사용, 테스트모드는 미지급). 모달 680px 고정 유지. 추첨 로직 보존
- 2026-06-06 세션11-3(이벤트 시안 인라인 그대로 이식): screens.event의 HTML/CSS를 Tailwind 변환 없이 인라인 style + 시안 클래스(.btn/.note/.nick/.tog/.row/.badge/.wheel 등)로 이식. globals.css에 시안 :root 변수(--rose/--rose-bg/--rose-bd/--green/--blue 등) + 클래스를 `.ruru-event-sian` 스코프로 추가(전역충돌 방지). 룰렛은 canvas 실제스핀 유지(화살표 휠 안으로 삽입). 추첨/포인트/API/상태 로직 보존, 핸들러만 연결. + UI작업 필수원칙/룰렛기준 섹션 CLAUDE.md 추가
- 2026-06-06 세션11-2(이벤트 시안⑨ 1:1 + 실제 canvas 룰렛): 패널 본문을 시안⑨ 단일컬럼으로 재구성(상단 룰렛+돌리기 | 참가자3버튼[👥주문서전체/💵입금완료/✎수동]+당일중복금지·가중치 토글 / 당첨고정 rose박스 칩 / 제목+당첨선물50:50 / 위젯주소 / 이벤트목록 기간필터+달력). 시안색상(rose-deep/rose-soft/rose-line/#f7f5f1). conic div → **실제 canvas 룰렛**(requestAnimationFrame, 당첨확정 시 8~14바퀴·4~6초·easeOutCubic로 당첨칸 정지, 화살표 상단삽입, 가운데 당첨자 오버레이). 추첨/포인트/API/상태 로직 100% 보존. ※가중치·당일중복 토글·입금완료필터는 여전히 서버연동 P2/P3
- 2026-06-06 세션11(이벤트 패널 UI 시안 완전교체): AdminLiveEventRoulettePanel 렌더 JSX 전체를 시안 2단 레이아웃으로 교체(헤더 ◆이벤트+룰렛/인형뽑기탭+모드+초기화+✕ / 좌: conic-gradient 룰렛휠+화살표+가운데 당첨자오버레이+돌리기+위젯주소복사+이벤트목록[기간필터 오늘·주·월·날짜+달력, dateTimeFull 년월일(요일)시간] / 우: 참가자3버튼[활성방송기준·OFF비활성]+목록토글+채팅@파싱 / 당첨고정칩 / 당일중복금지·가중치(누적금액40%+당일60%) 토글 / 당첨선물 50:50). 룰렛=conic-gradient div(canvas 대신, 동일 모양·안정적). 기존 추첨/포인트/API/상태 로직 100% 보존, 렌더만 교체. 미사용 함수 일부 잔존(로직 보존 원칙). ※가중치·당일중복 토글은 UI 상태만(서버 추첨공식 연동은 P3), 입금완료 서버필터는 P2
- 2026-06-06 세션10(이벤트 P1-B): 참가자 3버튼(주문서전체/입금완료/수동) · 불러오기 기준=현재 활성방송(activeBroadcastId prop, Dashboard 전달) · 방송OFF시 전체/입금완료 버튼 비활성+안내 · 목록 토글(기본숨김) · 채팅붙여넣기 @파싱(중복제거) · 당첨고정 칩클릭(select 이중목록 제거)+"👑 당첨고정:닉" 한줄 · 당첨선물 드롭다운(포인트/직접)50:50+포인트 쉼표포맷 · 돌리기 시 currentEvent=null로 이전당첨자 제거. 추첨/포인트/돈 로직 무변경. ※입금완료 서버필터(paidOnly)는 P2 연동 대기
- 2026-06-06 세션10(이벤트 P1-A): 사이드바 "◆ 이벤트" 메뉴 추가(adminLiveMenu event 키) + AdminLiveEventRoulettePanel을 Dashboard에 항상마운트(controlled props renderTrigger/controlledOpen/onRequestClose, activeMenu=event일때 표시, 닫아도 상태유지) + 초기화 버튼(참가자+당첨고정+currentEvent 리셋). 추첨/포인트/주문 로직 무변경. ※기존 LiveHeader/LiveOrderTable의 "🎁 이벤트" 버튼 인스턴스는 잔존(별도 state) — 후속 정리 검토. ※P1 잔여=참가자3버튼/채팅@파싱/당첨고정칩/당첨선물 드롭다운(P1-B)
- 2026-06-06 세션9-2: 카드결제 복사창 좌우분할 개선 — 💳카드결제 버튼 클릭 시 복사창+페이스터 동시열림(openPaysterRightHalf를 LiveOrderTable 클릭 제스처에서 호출→팝업차단 회피), 페이스터=화면 오른쪽절반(left=½/width=½/height=전체), 복사창 모달=화면 왼쪽절반 고정(fixed inset-y-0 left-0 md:w-1/2)
- 2026-06-06 세션9: 카드결제 복사창 신규(AdminLiveCardPayPopup, 시안⑫). LiveOrderTable card_unpaid 입금셀에 "💳 카드결제" 버튼→팝업. 복사4칸(상품명 외N건요약/결제금액 cardPaymentTotalAmount우선 없으면 totalAmount 숫자만/닉네임 매칭기준/전화 하이픈제거) 각 클립보드복사. 페이스터 window.open(PC≥1024 우측반분할, 복사창 유지). "카드결제완료 처리"=DetailDrawer handleCardPaymentStatusChange와 동일 update(orders admin_order_status_v2/order_manage_status="카드결제완료", order.items id 기준)→loadOrders, 신규 결제write 없음
- 2026-06-06 세션8-2: 팝업 제목 시안 통일(Dashboard 정산통계→정산·입금확인→입금내역, admin-v2 ManualPaymentMatchDrawer 수동입금매칭→입금매칭). 제목 텍스트만, 돈/입금/정산 로직 무변경. ※admin-v2는 사장님 명시 허용으로 제목만 변경(구버전 AdminV2Client도 같이 바뀜, 미사용)
- 2026-06-06 세션8: 상품관리 팝업 신규(AdminLiveProductManagePopup, 사이드바 "상품" 메뉴→fixed모달, 시안②기준 탭[방송상품/공구·상시판매/전체창고]+상품명검색+올림날짜(created_at)+2열카드 다중선택+페이지네이션, "+새상품등록"→기존 ruru-open-quick-product-panel 이벤트로 ③폼, "순환담기"→broadcast_products insert(중복제외, 활성방송필요)). 방송/돈 로직 무변경. 가정: 공구·상시탭=product_type group_buy(상시판매 별도타입 없음), 올림날짜=created_at. 기존 AdminLiveProductListPanel은 미사용으로 잔존
- 2026-06-06 세션7-3: 시안 라벨 통일(사이드바 메뉴명 방송→주문·입금/정산통계→정산/고객관리→고객·이슈/카톡상담→카톡채널, 메인 송장출력·물건챙기기·검색placeholder 시안문구, 팝업제목 주문상세→✎주문서수정/포인트관리→🪙포인트/CUSTOMER DETAIL→👤회원상세) + 방송모드 토글 추가(AdminLiveSidebar, LiveHeader title/url을 Dashboard로 끌어올려 공유, URL있을때만 ON가능, ON→startBroadcast OFF→endBroadcast, start/end 로직 무변경)
- 2026-06-06 세션7-2: 용어 표시라벨 2차 통일(AdminLiveDashboard/AdminLiveOrdersPanel/adminLiveOrderExcelExport에서 "입금매칭 필요"→"매칭필요", "카드 미결제"→"카드미결제", 표시만·영어 status코드 무변경, 엑셀 상태칸 텍스트도 반영). CustomersPanel/SettlementPanel은 정규식(분류 로직)이라 표시통일 대상 아님
- 2026-06-06 세션7: 용어 표준 확정(입금대기/입금확인/매칭필요/카드미결제/카드결제완료, 입금내역/입금매칭) · 표시 라벨 통일 1차(LiveOrderTable/LiveOrderDetailDrawer/LiveStatsCards에서 "입금매칭 필요"→"매칭필요", "카드 미결제"→"카드미결제", 영어 status 코드·분류 정규식은 무변경)
- 2026-06-06 세션6: 방송패널 3분할(영상+채팅+지금띄운상품 flex 1:3:1.2, 높이360, 영상9:16) / 지금띄운상품=고정1개(사진+상품명+금액+옵션+다른상품띄우기) / 등록상품리스트패널 제거 / 주문서 10칸(주문일·닉네임·이름·주문내용·수량·상품금액·택배비·총금액·입금·출고, 주문일=createdAt YYYY.MM.DD/(요일)HH:mm 두줄, 입금=배지+paidAt, 주문내용 font-black) / 헤더+셀 전부 가운데정렬(text-center) 통일
- 2026-06-05 세션4~5: 주문서 그리드 개선, 실시간 필터, 매출요약 6항목, 방송패널 3분할 진입
- 2026-06-05 세션3: 고객관리 모달 완성(회원목록/고객이슈), 메인화면 재설계 진입, 매출요약6항목 배포, DB 확인(배송처·출고 데이터 비어있음)
- 2026-06-04 세션1~2: 딥로즈 색상 전면적용(파랑제거), 주문테이블 카드형, 사이드바→팝업모달 구조 전환

## 남은 작업 (우선순위 순 · 끝나면 지우고 진행상황에 기록)
[admin-live 관리자]
1. 화면 전체 용어·버튼·라벨·문구 시안 기준 전수 통일 (입금상태뿐 아니라 전 화면 일괄, 일부만 고치지 말 것) — 입금상태·메뉴·주요 팝업제목(정산·입금내역·입금매칭 포함) 통일 완료. 잔여 세부 라벨은 화면별 점검 시 추가
2. 이벤트 — P1 완료. ✅완료: 시안⑨ 인라인, canvas 실제스핀, 인형뽑기 탭, 당첨 포인트 자동지급(운영모드만), 중복당첨 토글(excludeDailyDup), **입금완료 서버필터(paidOnly)**, 당첨자목록 종류뱃지. 잔여: P2-나머지(winners 기간필터 서버연동), P3(가중치 추첨공식 서버 — 토글UI만). ✅당첨 자동지급 중복가드(5a235d5): grantedEventIdsRef 세션가드 + is_reward_done 영구게이트(지급성공 시 mark_reward_done true) — 재실행/재로드 재지급 차단, 지급↔지급완료 배지도 자동 연동됨
3. 수동매칭 설정 팝업 메뉴
4. ⚠️ 포인트 일괄지급(시안⑩) 신규 구축 — 현재 빈 placeholder. 명단추가→한번에 지급(grant API 반복)+기간별 기록. 새 지급로직이라 spec 받고 진행
5. (사장님 추가 예정 — 그 외 작업 생각나는 대로 여기 누적)
   ※ 후속: 상품관리 팝업 — 상시판매 별도 type 도입 / 올림날짜 전용 필드 / 기존 AdminLiveProductListPanel 정리 여부

[포인트 자동적립] — 코드(설정 UI·주문서 멘트·트리거 SQL·소급 SQL)는 완료. 운영 적용/검증 남음:
- ⚠️ Supabase에서 order_point_auto_earn_rpc.sql 실행(미적용이면 자동적립 안 됨) + 설정에서 자동적립 ON + 적립률 저장
- 소급적립(order_point_backfill_today.sql) 오늘건 1.5% 실행 여부는 사장님 판단(1단계 미리보기 후)
- 시안 ⑪ 적립규칙 잔여: "90일 미사용 소멸" / "환불·취소 시 자동 회수" 토글 — 이번엔 ON/OFF+적립률만 구현. 필요 시 추가 설계
- 포인트 사용 주문은 현재 적립 제외(정책). 포함 원하면 트리거/소급 SQL의 point_used_amount 조건 제거

[카드결제 팝업] — ⚠️ 페이스터 iframe 임베드 차단(X-Frame-Options) 시 우측 빈화면 → window.open 방식 복귀 필요(실기기 검증 후 결정)

[고객 주문 페이지] — 시안: /Users/ruru/Downloads/files/루루동이_손님페이지_위젯_통합본.txt (텍스트 사양, 딥로즈 #7B2D43 인라인). app/order/page.tsx 섹션별 증분:
- ✅ P1 상단바+☰메뉴 (세션14)
- ✅ P2 주문방법 접기/펼치기 (추가형 howToOpen)
- ✅ P3 영상 — 방송 ON+유튜브URL일 때만 16:9 임베드+접기 (videoOpen/videoEmbedSrc)
- ✅ P10 방송 위젯 신규 라우트 /product-widget (OBS, 고정/순환/주문토스트/투명배경, 읽기전용)
- ✅ P4 상품목록 — 딥로즈 검색+2열격자+페이지네이션, 카드(방송중배지=is_pinned/품절 SOLD OUT), 직접입력 fallback (quickGroupBuyProducts/selectQuickGroupBuyProduct 재사용)
- ✅ P5 옵션 선택 시트 — 딥로즈, 색상/사이즈(선택·입력형)+수량+선택금액+필수 빨강경고 (registeredOption* 재사용)
- ✅ P6 담기 confetti 토스트 — addRegisteredProductToOrderItems 후 '🎉 주문서에 담았어요!'+주문서보기/계속담기
- ✅ P7 주문서 결제부 딥로즈 — OrderPriceSummaryBox 인라인 재작성(금액내역+보유포인트/사용입력/전액사용/사용차감/🪙적립예정), 결제방법(무통장·카드+率)+카드안내+제출바+장바구니 코랄→딥로즈. 금액/포인트/제출 로직 100% 무변경(렌더만). ※적립률 코드에 없어 '적립 예정' 숫자 미표기(일반안내) — 률 정하면 숫자 반영
- ✅ P8 제출 후 계좌안내 — CustomerPaymentGuideBottomSheet coral→rose-deep/soft/line 딥로즈(입금자명·계좌복사·닉네임복사·금액 무변경)
- ✅ P9 주문조회 배지 — 입금확인 초록/택배출고 파랑/입금대기 노랑/그외 회색, 활성탭 등 딥로즈 통일
- ★ 고객 order page P1~P10 전체 시안 1:1 완료(딥로즈 #7B2D43). 돈/입금/주문제출/포인트 로직 전부 무변경
- 진입(카톡로그인/유튜브닉네임 유니크) 화면도 시안 반영 대상

※ 위 목록은 완전하지 않을 수 있음. 사장님이 새 작업 말하면 즉시 여기 추가할 것.

## 필수 확인 절차
코드 수정 전 반드시:
1. 관련 파일 nl -ba로 실제 라인 확인
2. 돈/입금/정산/배송 로직 포함 여부 확인
3. 변경 범위 최소화

## 금지 사항
- 추정으로 돈/입금/정산/배송/주문상태/포인트/Bankda 로직 수정 금지
- grep 결과만 보고 수정 금지
- order_items 테이블 신규 write 금지 (deprecated)
- localStorage에 운영 데이터 저장 금지
- admin / admin-v2 폴더, DB schema·RLS 건드리지 말 것
- **LiveOrderTable.tsx는 임의로 전체 교체 금지. 기존 필터/로직(상태칩·정렬·페이지·검색·onSelectOrder 등) 유지하며 최소 수정만.** (닉네임 클릭→onSelectOrder→주문상세 드로어 연결은 이미 동작 중)

## 빌드 및 검수
npm run build (반드시 "✅ BANKDA 안전가드 통과" 메시지 확인)
grep -r "TODO\|FIXME\|console.log" components/ app/
git status

## 기술 함정
- 맥 sed s///1은 줄마다 첫 매칭이라 여러 줄 다 바뀜 → 여러 줄 치환은 python 스크립트 사용
- 긴 체인(sed+build+commit+push 한 줄)은 중간에 멎음 → 단계 분리

## DB 규칙
- 스키마 변경: ADD COLUMN only
- canonical 테이블: orders (flat)
- 입금 추적: deposits 테이블

## DB 변경사항 — Supabase SQL Editor에서 직접 실행해야 적용됨 (커밋만으로는 미적용)
포인트 관련 테이블: customer_point_balances(잔액), customer_point_ledger(이력, change_type grant/use/cancel/adjust/expire), customer_point_gifts는 ledger의 customer_visible+seen으로 표시.
적립 금액 컬럼은 orders.final_amount(=total_price=adjusted_total_price, 택배비 제외 상품금액은 adjusted_product_price?? product_price × qty).
- **supabase/sql/order_point_auto_earn_rpc.sql** — 자동적립 트리거. orders ADD COLUMN point_earned_at/point_earned_amount + 트리거 trg_accrue_order_points(입금확인·카드결제완료 전환 시 settings.point_earn_rate%로 적립, 1주문1회, 포인트사용/테스트/정산제외 제외, customer_seen_at=now라 선물팝업 미표시). **아직 미적용이면 자동적립 안 됨.**
- **supabase/sql/order_point_backfill_today.sql** — 오늘(KST) 이미 결제완료된 건 소급적립(고정 1.5%=15/1000). 1단계 미리보기 SELECT → 확인 → 2단계 DO 실행. point_earned_at 가드로 트리거와 중복 안 됨.
- 기존: customer_order_submit_with_points_rpc.sql(주문저장+포인트차감 RPC, 적립 없음), customer_points.sql, order_point_usage_columns.sql 등
- ⚠️ 자동적립을 쓰려면: ① 위 트리거 SQL 적용 + ② 관리자 설정에서 "자동적립 ON" + 적립률(예 1.5) 저장 (둘 다 필요)


## UI 작업 필수 원칙 (완전 리뉴얼 프로젝트)

## 핵심 원칙 (절대 준수)
- 이 프로젝트는 기존 UI/UX를 전부 무시하고 시안 기준으로 완전히 새로 만드는 리뉴얼 작업
- 기존 코드 위에 얹거나 수정하는 방식 금지. 반드시 시안 기준으로 새로 설계
- UI 작업 시 시안 파일 /Users/ruru/Downloads/시안모음.html 에서 해당 화면 screens.XXX 코드 직접 읽고 HTML 구조/인라인스타일/클래스 1:1 JSX 변환
- Tailwind 임의 변환 금지. 시안 인라인 style 그대로 사용
- 시안에 없는 구조/색상/레이아웃 임의 추가 금지
- 시안과 다르게 만들면 작업 실패. 다시 만들 것
- 시안 작업 시 용어/단어는 시안 기준이 아닌 현재 시스템에서 사용 중인 통일된 용어를 따른다. 시안의 단어가 현재 시스템 용어와 다를 경우 현재 시스템 용어 우선.

- 이 프로젝트는 기존 코드를 수정하는 게 아니라 시안 기준으로 완전히 새로 만드는 리뉴얼 작업
- UI 작업 시 기존 코드 위에 얹지 말 것. 반드시 시안 파일을 직접 읽고 1:1로 구현
- 시안 파일 경로: /Users/ruru/Downloads/시안모음.html
- UI 작업 전 반드시: cat /Users/ruru/Downloads/시안모음.html 에서 해당 화면 screens.XXX 코드 읽고 구조/색상/비율 파악 후 구현
- 색상 변수: --rose:#7B2D43 --rose-bg:#F5E6EB --rose-bd:#D9C5CC --green:#0F6E56 --blue:#185FA5
- 시안과 다르게 만들면 작업 실패. 추상적 명령어로 임의 해석 금지

## 룰렛/이벤트 작업 기준
- 룰렛은 반드시 canvas + 실제 스핀 애니메이션 (conic-gradient div는 회전 안 됨)
- 화살표(▼)는 룰렛 안으로 50% 삽입 (너무 위에 떠있으면 안 됨)
- 당첨자 표시는 룰렛 가운데 오버레이
- 회전: 30바퀴, 4~6초, ease-out (당첨칸 정지)
- 방송용 위젯 배경은 반드시 transparent (OBS 크로마키용)

## 확정된 설계 기준
- 관리자 화면: 사이드바 클릭 = 페이지 전환 아님. 방송화면+채팅+주문서 항상 뒤에 유지, 각 기능은 fixed 팝업 모달로 오버레이
- 입금상태 용어: 입금대기/입금확인/매칭필요/카드미결제/카드결제완료
- 출고 용어: 출고대기/택배출고
- 결제수단: 무통장/카드
- 화면명: 입금내역/입금매칭
- 시안 파일: /Users/ruru/Downloads/시안모음.html

## 스택
Next.js / Supabase / Vercel
관리자: /admin-live 경로 (/admin 은 구버전, 미사용)
프로젝트 경로: /Users/ruru/Desktop/ruru-order-app

## 2026-06-10 관리자 UI 정리 (실시간주문 중심 통합)
- 테스트 주문 배지: 화면에서 숨김(testOrderBadge 항상 null). is_test_order 데이터/필터/정산제외 로직은 무변경. (8c436e3)
- 주문 날짜 연도/월 필터 추가: 날짜 드롭다운에 "연·월 선택" + 연도(올해~3년전)/월(1~12) 드롭다운. LiveOrderFilters에 filterYear/filterMonth 추가, matchesDate에 yearmonth 판정. 기존 필터(all/today/yesterday/7days/month/custom) 무변경. (커밋)
- 중복 새로고침 버튼 제거: 탭바 ↻ 삭제, 주문테이블 툴바 ↻(onRefresh)만 유지. 둘 다 loadOrders 호출하던 중복. (커밋)
- 주문 관리 탭/팝업 제거: 실시간 주문서와 기능 완전 중복(둘 다 LiveOrderTable). 실시간 주문서에서 "방송: 전체보기"로 전체 주문 조회 가능(filteredOrders의 broadcast==="all"이면 true). 탭 3개로 축소(실시간주문/입금내역/입금매칭). AdminLiveOrdersPanel.tsx 파일은 보존(삭제 안 함). (f358d28)

### 관리자 화면 원칙 (업계 표준 reconciliation/UX 검색 반영)
- 메뉴/패널은 적을수록 좋고 중복 제거가 표준. 주문은 상태탭+날짜필터 하나로 관리(별도 주문관리 페이지 불필요).
- 실시간 주문서 = 전체 주문 관리 겸용. "방송: 전체보기"가 전체 조회.

### 남은 작업 후보
- 실시간 주문서 "전체보기"에서 과거 전체 주문(1000건 초과)이 다 보이는지 검증 필요 — loadOrders도 행수 캡 영향 가능성. 안 보이면 페이지네이션 적용.
- 포인트 일괄지급 UI, 관리자 고객정보 직접수정, 정산 메뉴.

## 2026-06-10 주문 조회 범위 + 첫화면 기본값 (해결 완료)
- [해결됨] loadOrders의 .limit(500) 제약 해소: "전체보기" 또는 "연·월 선택" 필터일 때만 .range 페이지네이션으로 전체 주문 로드(needsFullLoad 분기). 평소(현재방송/오늘/7일/특정방송)는 500건 유지(방송 중 성능). filters.broadcast/date 변경 시 재조회 useEffect 추가(마운트 중복은 ref로 스킵). (933347d)
- 첫 접속 기본 필터: 방송 중이면 현재 방송 주문(broadcast="current"), 아니면 전체(라이브 표준). 1회성 초기화(didInitBroadcastFilter ref), 사용자가 바꾼 필터는 안 덮어씀. (커밋)

### 다음에 할 후보
- 알림 소리(새 주문 들어오면 소리) — 라이브 표준, 미구현. realtime orders INSERT 감지해서 소리 재생.
- 포인트 일괄지급 UI, 관리자 고객정보 직접수정, 정산 메뉴.
