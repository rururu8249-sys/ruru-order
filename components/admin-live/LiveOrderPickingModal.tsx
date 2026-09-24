"use client";

// 물건챙기기 체크리스트 팝업 (주문서 단위 패널).
//   - 주문서 1건(같은 order_group_id) = 패널 1개. 같은 닉네임이라도 주문서 다르면 다른 패널.
//   - 패널 안 상품별 "챙김" 체크 + 전부 체크되면 패널 자동 "완료". 패널 헤더로 일괄 체크/해제도 가능.
//   - 체크는 orders.picked_at(서버)에 저장 → 다른 기기/새로고침에도 유지.
//   - "결제완료만" 토글(기본 ON, 끄면 미결제 포함·취소건 항상 제외), ㄱㄴㄷ/시간 정렬, 전체 초기화, 엑셀.
//   - 상단 "챙김 N개 / 전체 M개"는 수량 합계. picked_at 한 칸만 update(돈/주문 로직 무관).

import { useEffect, useMemo, useState } from "react";
import { formatOrderOptionText } from "@/lib/orderOptionText";
import { compareOrderOptions } from "@/lib/orderOptionSort";
import { supabase } from "@/lib/supabase";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import type { LiveOrder, LiveOrderItem } from "./types";
import { exportLiveOrdersForPicking } from "./adminLiveOrderExcelExport";

type Props = { orders: LiveOrder[]; filterLabel: string; onClose: () => void };

// [2026-07-13 사장님 지침] amount = 주문에 저장된 상품금액(표시 전용, 재계산 안 함)
type PickItem = { id: string; text: string; productName: string; optionText: string; color: string; size: string; qty: number; amount: number };
type Panel = { key: string; nickname: string; name: string; phone: string; search: string; paid: boolean; when: string; items: PickItem[]; totalQty: number };
type BatchBuyer = { nickname: string; qty: number; paid: boolean; ids: string[] };
// [2026-09-20 사장님 요청] 상품별 = 상품(총 N개) → 그 밑에 옵션(색상/사이즈)별 N개. 옵션은 색상 가나다 → 사이즈 순.
type BatchOption = { key: string; optionText: string; color: string; size: string; ids: string[]; totalQty: number; pickedQty: number; paidQty: number; buyers: BatchBuyer[] };
type BatchProduct = { name: string; ids: string[]; totalQty: number; pickedQty: number; paidQty: number; options: BatchOption[] };

const PAID_STATUSES = ["paid", "auto_paid", "manual_paid", "card_paid"];
const clean = (v: unknown) => String(v ?? "").trim();

// 정렬용 raw 타임스탬프(ms). 파싱 실패 시 0.
const ts = (s: string) => {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
};

// 제출시각 → KST "YYYY.MM.DD(요일) 오전/오후 h:mm" 보기 편한 형식. 파싱 실패 시 빈 문자열.
//   오전/오후는 환경(ICU) 안 타게 24시 값에서 직접 계산.
const whenText = (s: string) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let h = parseInt(get("hour"), 10);
  if (!Number.isFinite(h) || h === 24) h = 0;
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${get("year")}.${get("month")}.${get("day")}(${get("weekday")}) ${ampm} ${h12}:${get("minute")}`;
};

export default function LiveOrderPickingModal({ orders, filterLabel, onClose }: Props) {
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"nickname" | "time">("nickname");
  // [2026-09-20 개편] 상품별 정렬(가나다 / 많은 순)
  const [batchSort, setBatchSort] = useState<"name" | "qty">("name");
  // [2026-09-24 사장님] 「체크완료시 화면 접히는기능 없애줘!! 귀찮아 죽겠네 확인이 안됨」
  //   예전: 다 챙기면 «자동으로 접혔다»(펼친 것만 기억) → 방금 체크한 게 뭐였는지 확인이 안 됐다.
  //   지금: 자동으로 안 접는다. 접은 것만 기억한다(▴ 를 직접 눌렀을 때만 접힘).
  //   ⚠ 이 뒤집힘이 핵심이다. expandedDone(펼친 것) → collapsedDone(접은 것).
  const [collapsedDone, setCollapsedDone] = useState<Set<string>>(new Set());
  const toggleCollapsedDone = (key: string) => setCollapsedDone((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const [paidOnly, setPaidOnly] = useState(true);
  const [unpickedOnly, setUnpickedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"order" | "batch">("order");
  // [2026-08-23 상품별 집계 통합] 주문자 칩 표시 토글 — 집계 볼 땐 ON, 물건 집을 땐 OFF
  const [showBuyers, setShowBuyers] = useState(true);
  const [search, setSearch] = useState("");
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 주문서 단위 패널 (취소건 제외)
  const panels = useMemo<Panel[]>(() => {
    const list: Panel[] = [];
    for (const o of orders) {
      const status = clean(o.paymentStatus);
      if (status === "canceled") continue;
      const paid = PAID_STATUSES.includes(status);
      const nickname = clean(o.nickname) || clean(o.name) || "-"; // 주문 닉네임(크게)
      const name = clean((o as any).recipientName) || clean(o.name) || ""; // 받는사람/이름(옆에 함께 표시)
      // 검색용: 닉네임·이름·받는사람 전부 포함(닉네임으로 검색해도, 이름으로 검색해도 잡히게)
      const searchText = [clean(o.nickname), clean(o.name), clean((o as any).recipientName)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const when = clean(o.createdAt) || clean((o as any).submittedAt);
      const rawItems = Array.isArray(o.items) ? (o.items as LiveOrderItem[]) : [];
      const items: PickItem[] =
        rawItems.length === 0
          ? [{ id: String(o.id), text: clean(o.orderSummary) || "상품", productName: clean(o.orderSummary) || "상품", optionText: "", color: "", size: "", qty: 1, amount: Number(o.productAmount || 0) }]
          : rawItems.map((it) => {
              const opt = formatOrderOptionText(it.color, it.size); // [2026-08-31] 없음 숨김·「사이즈 6」 표기
              const productName = clean(it.productName) || "상품";
              return { id: String(it.id), text: productName + (opt ? ` (${opt})` : ""), productName, optionText: opt, color: clean(it.color), size: clean(it.size), qty: Number(it.qty || 1), amount: Number(it.amount || 0) };
            });
      const totalQty = items.reduce((s, it) => s + (Number.isFinite(it.qty) ? it.qty : 1), 0);
      const phone = clean(o.phone).replace(/[^0-9]/g, ""); // 같은 고객 판정용(숫자만)
      list.push({ key: String(o.groupId || o.id), nickname, name, phone, search: searchText, paid, when, items, totalQty });
    }
    return list;
  }, [orders]);

  // 범위(결제완료만 토글 + 정렬) — 진행률/초기화 기준
  const scopedPanels = useMemo(() => {
    const arr = panels.filter((p) => (paidOnly ? p.paid : true));
    if (sortMode === "nickname") {
      // 화면 큰 글씨(닉네임) 기준 정렬. 순서: 한글 → 영어 → 숫자 → 기타. 같은 그룹 안은 가나다/알파벳순.
      const rank = (s: string) => {
        const c = (s || "").trim().charAt(0);
        if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c)) return 0;
        if (/[a-zA-Z]/.test(c)) return 1;
        if (/[0-9]/.test(c)) return 2;
        return 3;
      };
      arr.sort((a, b) => {
        const ra = rank(a.nickname), rb = rank(b.nickname);
        if (ra !== rb) return ra - rb;
        return a.nickname.localeCompare(b.nickname, "ko") || ts(a.when) - ts(b.when);
      });
    }
    else arr.sort((a, b) => ts(a.when) - ts(b.when));
    return arr;
  }, [panels, paidOnly, sortMode]);

  // 검색(닉네임 또는 상품명) — 화면 표시용. 검색은 진행률/초기화 범위에 영향 없음.
  const visiblePanels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedPanels;
    return scopedPanels.filter((p) => p.search.includes(q) || p.nickname.toLowerCase().includes(q) || p.items.some((it) => it.text.toLowerCase().includes(q)));
  }, [scopedPanels, search]);

  // "안 챙긴 것만" 보기 — 켜면 다 챙긴 주문은 숨기고, 남은 주문은 안 챙긴 상품줄만 표시(막판 마무리용).
  const displayPanels = useMemo(() => {
    if (!unpickedOnly) return visiblePanels;
    return visiblePanels
      .map((p) => ({ ...p, items: p.items.filter((it) => !pickedIds.has(it.id)) }))
      .filter((p) => p.items.length > 0);
  }, [visiblePanels, unpickedOnly, pickedIds]);

  // 같은 고객(전화번호) 묶음 — 여러 주문이 같은 사람이면 합배송 안내(중복배송·누락 방지).
  const phoneCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of scopedPanels) if (p.phone) m.set(p.phone, (m.get(p.phone) || 0) + 1);
    return m;
  }, [scopedPanels]);

  // 상품별 합계(배치 피킹) — [2026-09-20 사장님 요청] 상품 한 장(총 N개) 안에 옵션(색상/사이즈)별 줄.
  //   예전엔 「막스라 코트 (베이지 / 사이즈 55)」 줄이 상품마다 흩어져 있어 "이 상품 총 몇 개"가 안 보였다.
  //   옵션 줄 순서 = 색상 가나다 → 사이즈(55<66<77, S<M<L). 주문자 칩(입금대기 ⏳)은 옵션 줄마다. 챙김 체크 동작은 기존 그대로.
  const batchProducts = useMemo<BatchProduct[]>(() => {
    const products = new Map<string, BatchProduct>();
    const optionMaps = new Map<string, Map<string, BatchOption>>();
    const buyerMaps = new Map<string, Map<string, BatchBuyer>>(); // key = product|option
    const q = search.trim().toLowerCase();
    for (const p of scopedPanels) {
      for (const it of p.items) {
        if (q && !it.text.toLowerCase().includes(q) && !p.search.includes(q)) continue;
        const prod = products.get(it.productName) || { name: it.productName, ids: [], totalQty: 0, pickedQty: 0, paidQty: 0, options: [] };
        prod.ids.push(it.id);
        prod.totalQty += it.qty;
        if (p.paid) prod.paidQty += it.qty;
        if (pickedIds.has(it.id)) prod.pickedQty += it.qty;
        products.set(it.productName, prod);

        const opts = optionMaps.get(it.productName) || new Map<string, BatchOption>();
        const optKey = it.optionText || "";
        const opt = opts.get(optKey) || { key: optKey, optionText: it.optionText, color: it.color, size: it.size, ids: [], totalQty: 0, pickedQty: 0, paidQty: 0, buyers: [] };
        opt.ids.push(it.id);
        opt.totalQty += it.qty;
        if (p.paid) opt.paidQty += it.qty;
        if (pickedIds.has(it.id)) opt.pickedQty += it.qty;
        opts.set(optKey, opt);
        optionMaps.set(it.productName, opts);

        // 같은 닉네임이라도 결제/대기가 다르면 칩 분리(대기분이 묻히지 않게)
        const bkey = `${it.productName}|${optKey}`;
        const buyers = buyerMaps.get(bkey) || new Map<string, BatchBuyer>();
        const bKey = `${p.nickname}|${p.paid ? "1" : "0"}`;
        const chip = buyers.get(bKey) || { nickname: p.nickname, qty: 0, paid: p.paid, ids: [] };
        chip.qty += it.qty;
        chip.ids.push(it.id);
        buyers.set(bKey, chip);
        buyerMaps.set(bkey, buyers);
      }
    }
    let list = Array.from(products.values());
    for (const prod of list) {
      const opts = Array.from((optionMaps.get(prod.name) || new Map<string, BatchOption>()).values());
      for (const opt of opts) {
        const buyers = buyerMaps.get(`${prod.name}|${opt.key}`);
        opt.buyers = buyers ? [...buyers.values()].sort((a, b) => b.qty - a.qty || a.nickname.localeCompare(b.nickname, "ko")) : [];
      }
      prod.options = unpickedOnly
        ? opts.filter((o) => o.pickedQty < o.totalQty).sort(compareOrderOptions)
        : opts.sort(compareOrderOptions);
    }
    if (unpickedOnly) list = list.filter((prod) => prod.pickedQty < prod.totalQty && prod.options.length > 0);
    return list.sort((a, b) => (batchSort === "qty" ? b.totalQty - a.totalQty : 0) || a.name.localeCompare(b.name, "ko"));
  }, [scopedPanels, pickedIds, search, unpickedOnly, batchSort]);

  // 여러 항목 일괄 토글(전부 챙김이면 해제, 아니면 전부 챙김) — 상품별 뷰에서 한 줄 = 그 상품 전부.
  const toggleIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const allPicked = ids.every((id) => pickedIds.has(id));
    const makePicked = !allPicked;
    setPickedIds((prev) => { const n = new Set(prev); ids.forEach((id) => (makePicked ? n.add(id) : n.delete(id))); return n; });
    try {
      await writePicked(ids, makePicked);
    } catch (e: any) {
      showAdminToast("일괄 체크 실패\n\n" + (e?.message || e), "error");
      await resyncPickedFromServer(ids);   // 화면을 DB 실제값으로 되돌린다
    }
  };

  // 열 때 서버에서 picked_at 조회
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = panels.flatMap((p) => p.items.map((it) => Number(it.id))).filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length === 0) { setPickedIds(new Set()); return; }
      const picked = new Set<string>();
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await supabase.from("orders").select("id, picked_at").in("id", ids.slice(i, i + 500));
        (data || []).forEach((r: any) => { if (r.picked_at) picked.add(String(r.id)); });
      }
      if (alive) setPickedIds(picked);
    })();
    return () => { alive = false; };
  }, [panels]);

  // [2026-09-08 전수감사] 일괄 체크가 저장에 실패해도 화면은 「챙김」으로 남아 있었다.
  //   → 화면은 챙겼다는데 DB(orders.picked_at)는 안 챙겨진 상태 = «누락 배송» 위험.
  //   단순히 되돌리면 안 된다: writePicked 는 500개씩 나눠 쓰므로 «앞부분만 저장»된
  //   부분 성공이 가능하다. 그래서 실패하면 해당 주문들의 picked_at 을 «DB에서 다시 읽어»
  //   화면을 DB와 정확히 맞춘다. (원래 주석 「롤백 위해 재조회」가 의도했던 것)
  //   ※ 읽기 전용 조회다. 주문·금액·입금엔 손대지 않는다.
  const resyncPickedFromServer = async (ids: string[]) => {
    const nums = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length === 0) return;
    try {
      const truth = new Map<string, boolean>();
      for (let i = 0; i < nums.length; i += 500) {
        const { data, error } = await supabase
          .from("orders")
          .select("id, picked_at")
          .in("id", nums.slice(i, i + 500));
        if (error) throw error;
        (data || []).forEach((r: any) => truth.set(String(r.id), Boolean(r.picked_at)));
      }
      setPickedIds((prev) => {
        const n = new Set(prev);
        truth.forEach((isPicked, id) => (isPicked ? n.add(id) : n.delete(id)));
        return n;
      });
    } catch {
      // 재조회까지 실패하면 화면을 건드리지 않는다(잘못된 상태로 덮어쓰는 게 더 위험).
      showAdminToast("지금 화면의 챙김 표시가 실제와 다를 수 있어요.\n\n창을 닫았다 다시 열어 확인해주세요.", "error");
    }
  };

  const writePicked = async (ids: string[], makePicked: boolean) => {
    const nums = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const value = makePicked ? new Date().toISOString() : null;
    for (let i = 0; i < nums.length; i += 500) {
      const { error } = await supabase.from("orders").update({ picked_at: value }).in("id", nums.slice(i, i + 500));
      if (error) throw error;
    }
  };

  const togglePick = async (id: string) => {
    const was = pickedIds.has(id);
    setPickedIds((prev) => { const n = new Set(prev); if (was) n.delete(id); else n.add(id); return n; });
    try {
      await writePicked([id], !was);
    } catch (e: any) {
      setPickedIds((prev) => { const n = new Set(prev); if (was) n.add(id); else n.delete(id); return n; });
      showAdminToast("챙김 저장 실패\n\n" + (e?.message || e), "error");
    }
  };

  // 패널 전체 토글(전부 체크돼 있으면 해제, 아니면 전부 체크)
  const togglePanel = async (panel: Panel) => {
    const ids = panel.items.map((it) => it.id);
    const allPicked = ids.every((id) => pickedIds.has(id));
    const makePicked = !allPicked;
    setPickedIds((prev) => { const n = new Set(prev); ids.forEach((id) => (makePicked ? n.add(id) : n.delete(id))); return n; });
    try {
      await writePicked(ids, makePicked);
    } catch (e: any) {
      showAdminToast("패널 일괄 체크 실패\n\n" + (e?.message || e), "error");
      await resyncPickedFromServer(ids);   // 주석만 있고 없던 재조회 — 실제로 실행한다
    }
  };

  const resetAll = async () => {
    if (!(await showAdminConfirm("챙김 표시를 모두 초기화할까요?\n\n지금 보이는 목록의 모든 체크가 해제됩니다. (주문·금액엔 영향 없음)"))) return;
    setResetting(true);
    try {
      const ids = scopedPanels.flatMap((p) => p.items.map((it) => it.id));
      await writePicked(ids, false);
      setPickedIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
      showAdminToast("챙김 표시를 초기화했습니다.", "success");
    } catch (e: any) {
      showAdminToast("초기화 실패\n\n" + (e?.message || e), "error");
      // 여기도 500개씩 나눠 쓰므로 «일부만 해제»될 수 있다 → DB 실제값으로 화면을 맞춘다
      await resyncPickedFromServer(scopedPanels.flatMap((p) => p.items.map((it) => it.id)));
    } finally {
      setResetting(false);
    }
  };

  const runExcel = async () => {
    setExporting(true);
    try {
      const exportOrders = paidOnly ? orders.filter((o) => PAID_STATUSES.includes(clean(o.paymentStatus))) : orders;
      // [2026-07-16] 챙김 여부 컬럼용 — 화면과 동일한 체크 집합(pickedIds) 전달
      // [2026-09-20 사장님 요청] 엑셀 줄 순서 = 지금 보는 화면 순서(상품별: 상품→색상→사이즈 / 주문별: ㄱㄴㄷ·시간)
      await exportLiveOrdersForPicking(exportOrders, { filterLabel, rowOrder: viewMode === "batch" ? "product" : sortMode }, pickedIds);
    } finally {
      setExporting(false);
    }
  };

  // 수량 합계
  const { pickedQty, totalQty } = useMemo(() => {
    let p = 0, t = 0;
    for (const panel of scopedPanels) for (const it of panel.items) { t += it.qty; if (pickedIds.has(it.id)) p += it.qty; }
    return { pickedQty: p, totalQty: t };
  }, [scopedPanels, pickedIds]);

  // [2026-08-31 사장님 요청] 돈 표시등 — 상품값 합계와 "실제 받은 돈"을 나란히 보여준다 (표시 전용).
  //   상품값 = 상품금액 합(엑셀의 상품금액 칸과 동일). 실제 받은 돈 = 결제완료 주문의 총금액 합
  //   (카드수수료 포함·포인트 차감 — 매출 바와 동일 기준). 두 숫자가 다른 게 정상이다.
  const moneySummary = useMemo(() => {
    const target = paidOnly ? orders.filter((o) => PAID_STATUSES.includes(clean(o.paymentStatus))) : orders;
    let goods = 0;
    let received = 0;
    for (const o of target) {
      const items = Array.isArray(o.items) ? o.items : [];
      goods += items.length > 0 ? items.reduce((sum, it) => sum + Number(it.amount || 0), 0) : Number(o.productAmount || 0);
      if (PAID_STATUSES.includes(clean(o.paymentStatus))) received += Number(o.totalAmount || 0);
    }
    return { goods, received };
  }, [orders, paidOnly]);

  const remainQty = Math.max(0, totalQty - pickedQty);
  const percent = totalQty > 0 ? Math.round((pickedQty / totalQty) * 100) : 0;
  const broadcastTitle = String(filterLabel || "").split(" · ")[0].replace(/^방송:\s*/, "").trim();

  // 공용 조각 — 체크 표시(네모) · 주문자 칩 줄
  const CheckBox = ({ state, size = "md" }: { state: "done" | "some" | "none"; size?: "md" | "sm" }) => (
    <span className={`flex shrink-0 items-center justify-center rounded-lg border-2 font-black ${size === "md" ? "h-7 w-7 text-[13px]" : "h-6 w-6 text-[12px]"} ${state === "done" ? "border-ok-tx/35 bg-[var(--color-ok-tx)] text-white" : state === "some" ? "border-ok-tx/35 bg-ok-bg text-ok-tx" : "border-line bg-surface text-transparent"}`}>{state === "some" ? "–" : "✓"}</span>
  );
  // [2026-09-22 사장님 지적 「너무 민감해서 실수로 클릭되고 풀린다」]
  //   묶음 체크(상품 전부 / 옵션 전부 / 주문 전부)는 «네모 칸»을 눌러야만 바뀐다.
  //   예전엔 줄 전체가 버튼이라 「랜덤박스」 줄을 스치기만 해도 17개가 한 번에 뒤집혔다.
  //   칸 크기 44×44 — Apple HIG 44pt · WCAG 2.2 AAA 44px(손가락 기준). 개별 1건 줄은 줄 전체 클릭 유지.
  const PickBox = ({ state, onPick, label, size = "md" }: { state: "done" | "some" | "none"; onPick: () => void; label: string; size?: "md" | "sm" }) => (
    <button type="button" onClick={onPick} aria-label={label} title={label}
      className={`flex shrink-0 items-center justify-center rounded-xl hover:bg-line/40 active:scale-95 ${size === "md" ? "h-11 w-11" : "h-10 w-10"}`}>
      <CheckBox state={state} size={size} />
    </button>
  );

  // [2026-09-22 사장님 요청 「한 상품을 여러 명이 샀는데 부분부분 체크가 안 된다」]
  //   물류 현장의 «분배(put-to-light)» 화면과 같은 구조 — 물건을 집은 뒤 사람별 칸에 나눠 담는다.
  //   ⚠ 칩(글자)이 아니라 높이 44px «칸»으로 만든 이유: 예전 칩은 높이가 18px밖에 안 돼
  //     WCAG 최소치(24px)에도 못 미쳤다. 손가락으로 정확히 눌리지 않는다.
  //   칸 하나 = 주문자 1명(같은 닉네임이라도 결제/대기가 다르면 따로). 누르면 그 사람 것만 챙김/해제.
  const BuyerTiles = ({ buyers, className }: { buyers: BatchBuyer[]; className: string }) => {
    const list = unpickedOnly ? buyers.filter((b) => !b.ids.every((id) => pickedIds.has(id))) : buyers;
    if (list.length === 0) return null;
    return (
      <div className={`grid grid-cols-2 gap-2 ${className}`}>
        {list.map((b, i) => {
          const bDone = b.ids.length > 0 && b.ids.every((id) => pickedIds.has(id));
          const bSome = !bDone && b.ids.some((id) => pickedIds.has(id));
          return (
            <button key={`${b.nickname}-${b.paid}-${i}`} type="button" onClick={() => toggleIds(b.ids)}
              title={`${b.nickname} — 누르면 이 손님 것만 챙김 / 해제${b.paid ? "" : " (미결제 ⏳)"}`}
              className={`flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl border-2 px-2 py-2 text-left active:scale-95 ${bDone ? "border-ok-tx/35 bg-[var(--color-ok-tx)]" : bSome ? "border-ok-tx/35 bg-ok-bg" : b.paid ? "border-line bg-surface" : "border-warn-tx/35 bg-warn-bg"}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-[12px] font-black ${bDone ? "border-white/40 bg-surface text-ok-tx" : bSome ? "border-ok-tx/35 bg-surface text-ok-tx" : "border-line bg-surface text-transparent"}`}>{bSome ? "–" : "✓"}</span>
              <span className={`min-w-0 flex-1 truncate text-[13px] font-bold ${bDone ? "text-white line-through" : b.paid ? "text-ink" : "text-warn-tx"}`}>{b.nickname}{b.paid ? "" : " ⏳"}</span>
              <span className={`shrink-0 whitespace-nowrap text-[13px] font-black ${bDone ? "text-white" : b.qty > 1 ? "text-rose-deep" : "text-ink-soft"}`}>{b.qty}<span className="text-[11px]">개</span></span>
            </button>
          );
        })}
      </div>
    );
  };
  const chip = (on: boolean, extra = "") => `rounded-lg px-3 py-1.5 text-[12px] font-black whitespace-nowrap ${on ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2"} ${extra}`;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[92vh] w-[min(720px,96vw)] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* ── 헤더: 제목 · 방송 · 닫기 ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[16px] font-black text-rose-deep">🛍 물건챙기기</span>
            {broadcastTitle ? <span className="truncate text-[12px] font-bold text-ink-mute">{broadcastTitle}</span> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[18px] font-black text-ink-soft hover:bg-line hover:text-ink">✕</button>
        </div>

        {/* ── 진행 상황: 남은 개수 크게 · 진행률 ── */}
        <div className="shrink-0 border-b border-line px-4 pb-3 pt-3">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-2">
              {remainQty > 0 ? (
                <>
                  <span className="text-[12px] font-black text-ink-soft">남은 물건</span>
                  <span className="text-[24px] font-black leading-none text-rose-deep">{remainQty.toLocaleString()}<span className="ml-0.5 text-[14px]">개</span></span>
                </>
              ) : totalQty > 0 ? (
                <span className="text-[20px] font-black leading-none text-ok-tx">🎉 다 챙겼어요</span>
              ) : (
                <span className="text-[16px] font-black leading-none text-ink-mute">챙길 물건이 없어요</span>
              )}
            </div>
            <div className="text-right text-[12px] font-bold text-ink-soft">
              챙김 <span className="font-black text-ok-tx">{pickedQty.toLocaleString()}</span> / 전체 {totalQty.toLocaleString()}개 <span className="text-ink-mute">· {percent}%</span>
            </div>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-[var(--color-ok-tx)] transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1.5 text-[11px] font-bold text-ink-mute" title="상품값 = 상품금액만 합친 것. 실제 받은 돈 = 카드수수료를 더하고 포인트를 뺀, 손님이 실제로 낸 돈(매출 바와 같은 기준). 두 숫자가 다른 게 정상이에요.">
            📦 상품값 {moneySummary.goods.toLocaleString()}원 · 💳 실제 받은 돈 {moneySummary.received.toLocaleString()}원
          </div>
        </div>

        {/* ── 보기 방식(탭) ── */}
        <div className="shrink-0 px-4 pt-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            <button type="button" onClick={() => setViewMode("batch")} className={`rounded-lg py-2 text-[13px] font-black ${viewMode === "batch" ? "bg-rose-deep text-white shadow" : "text-ink-soft hover:text-ink"}`}>📦 상품별로 모으기</button>
            <button type="button" onClick={() => setViewMode("order")} className={`rounded-lg py-2 text-[13px] font-black ${viewMode === "order" ? "bg-rose-deep text-white shadow" : "text-ink-soft hover:text-ink"}`}>👤 주문별로 담기</button>
          </div>
        </div>

        {/* ── 필터·정렬 ── */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-4 pt-2">
          <button type="button" onClick={() => setUnpickedOnly((v) => !v)} className={chip(unpickedOnly)}>{unpickedOnly ? "✓ " : ""}안 챙긴 것만{remainQty > 0 ? ` ${remainQty.toLocaleString()}` : ""}</button>
          <button type="button" onClick={() => setPaidOnly((v) => !v)} className={`rounded-lg px-3 py-1.5 text-[12px] font-black whitespace-nowrap ${paidOnly ? "bg-[var(--color-ok-tx)] text-white" : "border border-warn-tx/35 bg-warn-bg text-warn-tx"}`}>{paidOnly ? "✓ 결제완료만" : "⚠ 미결제 포함"}</button>
          {viewMode === "order" ? (
            <span className="inline-flex overflow-hidden rounded-lg border border-line">
              <button type="button" onClick={() => setSortMode("nickname")} className={`px-3 py-1.5 text-[12px] font-black ${sortMode === "nickname" ? "bg-ink-soft text-white" : "bg-surface text-ink-soft"}`}>ㄱㄴㄷ순</button>
              <button type="button" onClick={() => setSortMode("time")} className={`px-3 py-1.5 text-[12px] font-black ${sortMode === "time" ? "bg-ink-soft text-white" : "bg-surface text-ink-soft"}`}>주문 시간순</button>
            </span>
          ) : (
            <>
              <span className="inline-flex overflow-hidden rounded-lg border border-line">
                <button type="button" onClick={() => setBatchSort("name")} className={`px-3 py-1.5 text-[12px] font-black ${batchSort === "name" ? "bg-ink-soft text-white" : "bg-surface text-ink-soft"}`}>ㄱㄴㄷ순</button>
                <button type="button" onClick={() => setBatchSort("qty")} className={`px-3 py-1.5 text-[12px] font-black ${batchSort === "qty" ? "bg-ink-soft text-white" : "bg-surface text-ink-soft"}`}>많은 순</button>
              </span>
              <button type="button" onClick={() => setShowBuyers((v) => !v)} title="누가 샀는지 표시 — 한 옵션을 여러 명이 샀으면 손님별 칸이 생겨 한 명씩 챙길 수 있어요" className={chip(showBuyers)}>{showBuyers ? "✓ " : ""}주문자 이름</button>
            </>
          )}
        </div>

        {/* ── 검색 ── */}
        <div className="shrink-0 px-4 pb-2 pt-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="닉네임 · 상품명 검색"
              className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-9 text-[13px] font-bold outline-none focus:border-rose-deep focus:bg-surface"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px]">🔍</span>
            {search ? <button type="button" onClick={() => setSearch("")} aria-label="검색어 지우기" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-line text-[13px] font-black text-ink-soft">×</button> : null}
          </div>
        </div>

        {/* ── 목록 (이 영역만 스크롤) ── */}
        <div className="flex-1 overflow-y-auto border-t border-line bg-surface-2 px-3 py-3">
          {viewMode === "batch" ? (
            batchProducts.length === 0 ? (
              <div className="py-14 text-center text-[14px] font-bold text-ink-mute">{unpickedOnly ? "안 챙긴 상품이 없어요! 🎉" : search ? "검색 결과가 없어요" : "챙길 상품이 없습니다."}</div>
            ) : (
              <>
                <div className="mb-2 px-1 text-[11px] font-bold text-ink-mute">상품 {batchProducts.length}가지 · ✅ 네모 칸을 눌러야 챙김 표시가 돼요 · 한 옵션을 여러 명이 샀으면 아래 «손님 칸»을 눌러 한 명씩 챙기세요</div>
                <div className="space-y-2">
                  {batchProducts.map((prod) => {
                    const done = prod.ids.every((id) => pickedIds.has(id));
                    const some = !done && prod.ids.some((id) => pickedIds.has(id));
                    const single = prod.options.length === 1 && !prod.options[0].optionText;
                    const singleBuyers = single ? prod.options[0].buyers : [];
                    const collapsed = done && collapsedDone.has(`p:${prod.name}`);   // [09-24] 직접 접었을 때만
                    return (
                      <div key={prod.name} className={`rounded-xl border-2 ${done ? "border-ok-tx/35 bg-ok-bg/60" : "border-line bg-surface"}`}>
                        {/* 상품 줄(스크롤해도 위에 붙음) — 네모 칸만 눌러야 그 상품 전부 챙김/해제(실수 방지) */}
                        <div className={`sticky top-0 z-[1] flex items-center gap-1 rounded-t-[10px] pl-1 ${done ? "bg-ok-bg" : single ? "bg-surface" : "bg-rose-soft"} ${collapsed ? "rounded-b-[10px]" : ""}`}>
                          <PickBox state={done ? "done" : some ? "some" : "none"} onPick={() => toggleIds(prod.ids)} label={`${prod.name} — 이 상품 ${prod.totalQty}개 전부 챙김 / 해제`} />
                          <div className="flex min-w-0 flex-1 select-none items-center gap-3 py-3 pr-3">
                            <span className={`min-w-0 max-w-[60%] truncate text-[14px] font-black ${done ? "text-ink-mute line-through" : "text-ink"}`}>{prod.name}</span>
                            {single && showBuyers && singleBuyers.length === 1 ? <span className={`min-w-0 shrink truncate text-[12px] font-bold ${singleBuyers[0].paid ? "text-ink-mute" : "text-warn-tx"}`}>· {singleBuyers[0].nickname}{singleBuyers[0].paid ? "" : " ⏳"}</span> : null}
                            <span className="ml-auto shrink-0 whitespace-nowrap text-right">
                              <span className={`text-[18px] font-black leading-none ${done ? "text-ink-mute" : "text-rose-deep"}`}>{prod.totalQty}<span className="text-[12px]">개</span></span>
                              {!paidOnly && prod.totalQty !== prod.paidQty ? <span className="ml-1.5 text-[11px] font-black text-warn-tx">대기 {prod.totalQty - prod.paidQty}</span> : null}
                              <span className={`ml-2 text-[11px] font-black ${done ? "text-ok-tx" : "text-ink-mute"}`}>{done ? "✓ 완료" : `${prod.pickedQty}/${prod.totalQty}`}</span>
                            </span>
                          </div>
                          {done && !single ? (
                            <button type="button" onClick={() => toggleCollapsedDone(`p:${prod.name}`)} aria-label={collapsed ? "펼치기" : "접기"} className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-black text-ok-tx hover:bg-white/60">{collapsed ? "▾" : "▴"}</button>
                          ) : null}
                        </div>
                        {single && showBuyers && singleBuyers.length > 1 && !collapsed ? <BuyerTiles buyers={singleBuyers} className="px-3 pb-3 pl-[52px]" /> : null}
                        {/* 옵션 줄 — 색상 가나다 → 사이즈 순. 클릭 = 그 옵션만 */}
                        {!single && !collapsed ? (
                          <div className="divide-y divide-line border-t border-line">
                            {prod.options.map((opt) => {
                              const oDone = opt.ids.every((id) => pickedIds.has(id));
                              const oSome = !oDone && opt.ids.some((id) => pickedIds.has(id));
                              return (
                                <div key={opt.key || "(옵션없음)"} className={`${oDone ? "bg-ok-bg/70" : "bg-surface"} last:rounded-b-[10px]`}>
                                  <div className="flex w-full items-center gap-1 pl-3 pr-3">
                                    <PickBox size="sm" state={oDone ? "done" : oSome ? "some" : "none"} onPick={() => toggleIds(opt.ids)} label={`${opt.optionText || "옵션 없음"} — ${opt.totalQty}개 전부 챙김 / 해제`} />
                                    <div className="flex min-w-0 flex-1 select-none items-center gap-2 py-2">
                                      <span className={`min-w-0 max-w-[60%] truncate text-[14px] font-bold ${oDone ? "text-ink-mute line-through" : "text-ink"}`}>{opt.optionText || "옵션 없음"}</span>
                                      {showBuyers && opt.buyers.length === 1 ? <span className={`min-w-0 shrink truncate text-[12px] font-bold ${opt.buyers[0].paid ? "text-ink-mute" : "text-warn-tx"}`}>· {opt.buyers[0].nickname}{opt.buyers[0].paid ? "" : " ⏳"}</span> : null}
                                      <span className="ml-auto shrink-0 whitespace-nowrap text-right">
                                        <span className={`text-[16px] font-black leading-none ${oDone ? "text-ink-mute" : "text-ink"}`}>{opt.totalQty}<span className="text-[11px]">개</span></span>
                                        {!paidOnly && opt.totalQty !== opt.paidQty ? <span className="ml-1 text-[11px] font-black text-warn-tx">대기 {opt.totalQty - opt.paidQty}</span> : null}
                                        <span className="ml-2 text-[11px] font-bold text-ink-mute">{opt.pickedQty}/{opt.totalQty}</span>
                                      </span>
                                    </div>
                                  </div>
                                  {showBuyers && opt.buyers.length > 1 ? <BuyerTiles buyers={opt.buyers} className="px-3 pb-2.5 pl-[52px]" /> : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )
          ) : displayPanels.length === 0 ? (
            <div className="py-14 text-center text-[14px] font-bold text-ink-mute">{unpickedOnly ? "안 챙긴 게 없어요! 다 챙겼습니다 🎉" : search ? "검색 결과가 없어요" : "챙길 주문이 없습니다."}</div>
          ) : (
            <>
              <div className="mb-2 px-1 text-[11px] font-bold text-ink-mute">주문 {displayPanels.length}건 · ✅ 닉네임 옆 네모 칸 = 그 주문 전부 · 상품 줄은 줄 아무 데나 눌러도 돼요(1건씩) · 다 챙겨도 그대로 펼쳐 있어요(▴ 누르면 접힘)</div>
              <div className="space-y-2">
                {displayPanels.map((panel) => {
                  const pickedInPanel = panel.items.filter((it) => pickedIds.has(it.id)).length;
                  const complete = panel.items.length > 0 && pickedInPanel === panel.items.length;
                  const collapsed = complete && collapsedDone.has(`o:${panel.key}`);   // [09-24] 직접 접었을 때만
                  const sameCustomer = panel.phone ? (phoneCount.get(panel.phone) || 0) : 0;
                  return (
                    <div key={panel.key} className={`rounded-xl border-2 ${complete ? "border-ok-tx/35 bg-ok-bg/60" : "border-line bg-surface"}`}>
                      {/* 주문서(닉네임) 줄 — 네모 칸만 눌러야 그 주문 전체 챙김/해제(실수 방지) */}
                      <div className={`sticky top-0 z-[1] flex items-center gap-1 rounded-t-[10px] pl-1 ${complete ? "bg-ok-bg" : "bg-rose-soft"} ${collapsed ? "rounded-b-[10px]" : ""}`}>
                        <PickBox state={complete ? "done" : pickedInPanel > 0 ? "some" : "none"} onPick={() => togglePanel(panel)} label={`${panel.nickname} — 이 주문 ${panel.items.length}건 전부 챙김 / 해제`} />
                        <div className="flex min-w-0 flex-1 select-none items-center gap-2.5 py-2.5 pr-3">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white ${complete ? "bg-[var(--color-ok-tx)]" : "bg-rose-deep"}`}>{complete ? "✓" : (panel.nickname.charAt(0) || "?")}</span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              <span className={`max-w-[60%] shrink-0 truncate text-[14px] font-black ${complete ? "text-ink-mute line-through" : "text-ink"}`}>{panel.nickname}</span>
                              {panel.name && panel.name !== panel.nickname ? <span className="min-w-0 truncate text-[12px] font-bold text-ink-soft">· {panel.name}</span> : null}
                            </span>
                            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-ink-mute">
                              {whenText(panel.when) ? <span className="truncate">{whenText(panel.when)}</span> : null}
                              {panel.items.length > 1 || panel.totalQty > 1 ? <span className="shrink-0">· 상품 {panel.items.length}종 {panel.totalQty}개</span> : null}
                            </span>
                          </span>
                          {sameCustomer > 1 ? <span className="shrink-0 rounded-full bg-[var(--color-cardpay)]/12 px-2 py-0.5 text-[11px] font-black text-[var(--color-cardpay)]" title="같은 고객의 다른 주문도 있어요 — 한 박스로 같이 포장하세요(합배송)">📦 같은고객 {sameCustomer}건</span> : null}
                          {!panel.paid ? <span className="shrink-0 rounded-full bg-[var(--color-danger-tx)] px-2 py-0.5 text-[11px] font-black text-white">미결제</span> : null}
                          <span className={`shrink-0 text-[12px] font-black ${complete ? "text-ok-tx" : "text-rose-deep"}`}>{complete ? "✓ 완료" : `${pickedInPanel}/${panel.items.length}`}</span>
                        </div>
                        {complete ? (
                          <button type="button" onClick={() => toggleCollapsedDone(`o:${panel.key}`)} aria-label={collapsed ? "펼치기" : "접기"} className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-black text-ok-tx hover:bg-white/60">{collapsed ? "▾" : "▴"}</button>
                        ) : null}
                      </div>
                      {/* 상품 줄 */}
                      {!collapsed ? (
                        <div className="divide-y divide-line border-t border-line">
                          {panel.items.map((it) => {
                            const picked = pickedIds.has(it.id);
                            return (
                              <button key={it.id} type="button" onClick={() => togglePick(it.id)} className={`flex w-full items-center gap-3 py-2.5 pl-6 pr-3 text-left last:rounded-b-[10px] ${picked ? "bg-ok-bg/70" : "bg-surface hover:bg-surface-2"}`}>
                                <CheckBox state={picked ? "done" : "none"} size="sm" />
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className={`truncate text-[14px] font-bold ${picked ? "text-ink-mute line-through" : "text-ink"}`}>{it.productName}</span>
                                  {it.optionText ? <span className={`truncate text-[12px] font-bold ${picked ? "text-ink-mute" : "text-rose-deep"}`}>{it.optionText}</span> : null}
                                </span>
                                {it.amount > 0 ? <span className={`shrink-0 text-[12px] font-bold ${picked ? "text-ink-mute" : "text-ink-soft"}`}>{it.amount.toLocaleString("ko-KR")}원</span> : null}
                                <span className={`shrink-0 text-[16px] font-black leading-none ${picked ? "text-ink-mute" : it.qty > 1 ? "text-rose-deep" : "text-ink"}`}>{it.qty}<span className="text-[11px]">개</span></span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── 푸터: 위험한 초기화는 왼쪽 글자 버튼, 엑셀·닫기는 오른쪽 ── */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface px-4 py-2.5">
          <button type="button" onClick={resetAll} disabled={resetting} className="rounded-lg px-2 py-1.5 text-[12px] font-black text-[var(--color-danger-tx)] hover:bg-danger-bg disabled:opacity-50">{resetting ? "초기화중…" : "챙김 전체 초기화"}</button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] font-bold text-ink-mute sm:inline">체크는 서버 저장 · 다른 기기에서도 유지</span>
            <button type="button" onClick={runExcel} disabled={exporting} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-black text-ink hover:bg-surface-2 disabled:opacity-50">{exporting ? "내보내는중…" : "📄 엑셀"}</button>
            <button type="button" onClick={onClose} className="rounded-lg bg-rose-deep px-4 py-1.5 text-[12px] font-black text-white hover:opacity-90">닫기</button>
          </div>
        </div>
      </div>
    </div>
  );
}
