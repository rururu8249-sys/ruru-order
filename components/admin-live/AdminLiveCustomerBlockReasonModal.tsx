"use client";

// components/admin-live/AdminLiveCustomerBlockReasonModal.tsx
// 목적: 고객 차단사유 입력 — ① 왜 차단하나 ② 무엇을 거파했나(주문에서 고르기) ③ 메모
//
// [2026-09-22 사장님 요청]
//   「거파 했을때 뭘 거파했는지 고르기 쉽게 할 수있으면 좋을거 같아」
//   예전엔 자유 입력 한 칸뿐이라 상품명을 손으로 옮겨 적으셨다.
//
// ⚠ 저장은 예전 그대로 «텍스트 한 칸»(customers.block_reason)이다. 형식만 약속한다
//   (lib/customerBlockReason.ts). DB 변경 없음. 옛 자유 텍스트도 그대로 읽힌다.
// ⚠ 주문 조회는 읽기 전용. 주문/입금/배송/정산/포인트 로직 없음.
// ⚠ 브라우저 alert/confirm/prompt 사용 금지.
// ⚠ 누르는 칸은 44px 이상 — 물건챙기기와 같은 기준(Apple HIG 44pt · WCAG 2.2 AAA).

import { useEffect, useMemo, useState } from "react";
import { formatKoreanPhone, koreanPhoneVariants } from "@/lib/order/phone";
import { supabase } from "@/lib/supabase";
import {
  BLOCK_REASON_TYPES,
  buildBlockReason,
  blockReasonPicksItems,
  parseBlockReason,
  type BlockReasonType,
} from "@/lib/customerBlockReason";
import { rowItemLabel, fmtDate } from "./CustomerFullOrderHistory";

type Row = Record<string, any>;

type Props = {
  open: boolean;
  nickname: string;
  name: string;
  phone: string;
  /** 정체성 = 카카오ID. 없으면 전화번호 폴백(회원 상세·주문 이력과 같은 기준). */
  kakaoId?: string;
  /** 주문상세에서 열었을 때 그 주문 — 맨 위로 올라오고 품목이 미리 체크된다. */
  focusOrderKey?: string;
  defaultReason?: string;
  saving?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
};

type OrderGroup = { key: string; code: string; createdAt: string; broadcast: string; rows: Row[] };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function digitsOnly(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function formatPhone(value: unknown) {
  const digits = digitsOnly(value);
  if (digits) return formatKoreanPhone(digits);
  return clean(value) || "-";
}

function rowMoney(row: Row) {
  const amount = Number(row?.final_amount ?? row?.adjusted_total_price ?? row?.total_price ?? 0);
  return Number.isFinite(amount) && amount > 0 ? `${Math.round(amount).toLocaleString("ko-KR")}원` : "";
}

/** 사유에 적을 한 줄 — 「노다001신더 (235) ×1 79,000원」 */
function pickLabel(row: Row) {
  const money = rowMoney(row);
  return money ? `${rowItemLabel(row)} ${money}` : rowItemLabel(row);
}

export default function AdminLiveCustomerBlockReasonModal({
  open,
  nickname,
  name,
  phone,
  kakaoId = "",
  focusOrderKey = "",
  defaultReason = "",
  saving = false,
  errorMessage = "",
  onClose,
  onSubmit,
}: Props) {
  const [reasonType, setReasonType] = useState<BlockReasonType | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [keptItems, setKeptItems] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const safeKakao = clean(kakaoId).replace(/[^0-9A-Za-z_-]/g, "");
  const phoneDigits = digitsOnly(phone);

  // 열 때마다 초기화 — 옛 사유가 있으면 유형/메모/품목을 살려 이어 쓴다
  useEffect(() => {
    if (!open) return;
    const parts = parseBlockReason(defaultReason);
    setReasonType(parts.type);
    setMemo(parts.memo);
    setKeptItems(parts.items);
    setCheckedIds([]);
    setRows(null);
    setOpenGroups([]);
  }, [open, defaultReason]);

  // 이 손님의 주문 — 읽기 전용. 회원 상세 「주문 이력」과 같은 기준(카카오ID 우선, 전화 폴백).
  useEffect(() => {
    if (!open) return;
    let alive = true;

    (async () => {
      const phoneValues = koreanPhoneVariants(phoneDigits);
      if (!safeKakao && phoneValues.length === 0) { setRows([]); return; }

      let query = supabase
        .from("orders")
        .select("id, order_group_id, order_lookup_code, created_at, kakao_id, product_name, color, size, qty, total_price, adjusted_total_price, final_amount, broadcast_name, memo, is_deleted");

      if (safeKakao && phoneValues.length > 0) {
        query = query.or(`kakao_id.eq.${safeKakao},customer_phone.in.(${phoneValues.join(",")})`);
      } else if (safeKakao) {
        query = query.eq("kakao_id", safeKakao);
      } else {
        query = query.in("customer_phone", phoneValues);
      }

      const { data, error } = await query.order("created_at", { ascending: false }).limit(300);
      if (!alive) return;
      if (error) { setRows([]); return; }

      setRows(
        (data || []).filter((row: Row) => {
          if (row?.is_deleted === true) return false;
          if (safeKakao) {
            const rowKakao = clean(row?.kakao_id);
            if (rowKakao && rowKakao !== safeKakao) return false;
          }
          return true;
        }),
      );
    })().catch(() => { if (alive) setRows([]); });

    return () => { alive = false; };
  }, [open, safeKakao, phoneDigits]);

  // 주문서 단위로 묶는다. 주문상세에서 온 주문은 맨 위로.
  const groups = useMemo<OrderGroup[]>(() => {
    if (!rows) return [];
    const map = new Map<string, OrderGroup>();

    for (const row of rows) {
      const key = clean(row.order_group_id) || clean(row.order_lookup_code) || `row:${row.id}`;
      const group = map.get(key) || {
        key,
        code: clean(row.order_lookup_code),
        createdAt: clean(row.created_at),
        broadcast: clean(row.broadcast_name),
        rows: [],
      };
      group.rows.push(row);
      if (!group.createdAt || String(row.created_at) < group.createdAt) group.createdAt = clean(row.created_at);
      map.set(key, group);
    }

    const list = Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const focus = clean(focusOrderKey);
    if (!focus) return list;
    const hit = list.filter((g) => g.key === focus || g.code === focus);
    return hit.length > 0 ? [...hit, ...list.filter((g) => !hit.includes(g))] : list;
  }, [rows, focusOrderKey]);

  // 주문상세에서 왔으면 그 주문을 펼치고 품목을 미리 체크해 둔다(사장님이 보고 있던 그 주문)
  useEffect(() => {
    if (!open || groups.length === 0) return;
    const focus = clean(focusOrderKey);
    const first = focus ? groups.find((g) => g.key === focus || g.code === focus) : undefined;
    if (first) {
      setOpenGroups([first.key]);
      setCheckedIds(first.rows.map((r) => String(r.id)));
    } else {
      setOpenGroups([groups[0].key]);
    }
  }, [open, groups, focusOrderKey]);

  const picksItems = blockReasonPicksItems(reasonType);

  const pickedLabels = useMemo(() => {
    if (!rows) return [];
    const wanted = new Set(checkedIds);
    return rows.filter((row) => wanted.has(String(row.id))).map(pickLabel);
  }, [rows, checkedIds]);

  const finalReason = buildBlockReason({
    type: reasonType,
    items: picksItems ? [...keptItems, ...pickedLabels] : keptItems,
    memo,
  });

  const canSave = Boolean(clean(finalReason));

  if (!open) return null;

  const toggleId = (id: string) =>
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleGroupRows = (group: OrderGroup) => {
    const ids = group.rows.map((r) => String(r.id));
    const allOn = ids.every((id) => checkedIds.includes(id));
    setCheckedIds((prev) => (allOn ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  };

  const toggleGroupOpen = (key: string) =>
    setOpenGroups((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--color-ink-soft)]/35 p-4">
      <section className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border-2 border-danger-tx bg-surface shadow-2xl">
        {/* 머리 */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] font-black tracking-[0.18em] text-danger-tx">BLOCK</div>
            <h2 className="mt-1 text-[20px] font-black tracking-[-0.03em] text-ink">차단하기</h2>
            <p className="mt-1 text-[12px] font-bold text-ink-soft">
              {clean(nickname) || "-"} · {clean(name) || "-"} · {formatPhone(phone)}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[18px] font-black text-ink-soft hover:bg-line disabled:opacity-50">✕</button>
        </div>

        {/* 몸통 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* ① 유형 */}
          <div className="text-[13px] font-black text-ink">① 왜 차단하나요?</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {BLOCK_REASON_TYPES.map((item) => {
              const on = reasonType === item.type;
              return (
                <button key={item.type} type="button" onClick={() => setReasonType(on ? null : item.type)} title={item.hint}
                  className={`flex min-h-[44px] flex-col justify-center rounded-xl border-2 px-3 py-2 text-left ${on ? "border-danger-tx bg-danger-bg" : "border-line bg-surface hover:bg-surface-2"}`}>
                  <span className={`text-[13px] font-black ${on ? "text-danger-tx" : "text-ink"}`}>{on ? "✓ " : ""}{item.label}</span>
                  <span className="truncate text-[11px] font-bold text-ink-mute">{item.hint}</span>
                </button>
              );
            })}
          </div>

          {/* ② 품목 고르기 — 거파 계열에서만 */}
          {picksItems ? (
            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[13px] font-black text-ink">② 무엇을 거파했나요?</div>
                <div className="text-[11px] font-bold text-ink-mute">고른 것 {pickedLabels.length}개</div>
              </div>
              <p className="mt-1 text-[11px] font-bold text-ink-mute">주문서 줄을 눌러 고르세요. 안 고르고 메모만 남겨도 됩니다.</p>

              {rows === null ? (
                <div className="mt-2 rounded-xl border border-line bg-surface-2 px-3 py-6 text-center text-[12px] font-bold text-ink-mute">주문을 불러오는 중…</div>
              ) : groups.length === 0 ? (
                <div className="mt-2 rounded-xl border border-line bg-surface-2 px-3 py-6 text-center text-[12px] font-bold text-ink-mute">
                  이 손님의 주문을 찾지 못했습니다. 아래 메모에 직접 적어주세요.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {groups.map((group) => {
                    const ids = group.rows.map((r) => String(r.id));
                    const picked = ids.filter((id) => checkedIds.includes(id)).length;
                    const expanded = openGroups.includes(group.key);
                    return (
                      <div key={group.key} className={`rounded-xl border-2 ${picked > 0 ? "border-danger-tx/45 bg-danger-bg/40" : "border-line bg-surface"}`}>
                        <div className="flex items-center gap-1 pl-1">
                          <button type="button" onClick={() => toggleGroupRows(group)} aria-label="이 주문 전부 고르기" title="이 주문 전부 고르기 / 해제"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-line/40">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 text-[12px] font-black ${picked === ids.length ? "border-danger-tx/40 bg-[var(--color-danger-tx)] text-white" : picked > 0 ? "border-danger-tx/40 bg-danger-bg text-danger-tx" : "border-line bg-surface text-transparent"}`}>{picked > 0 && picked < ids.length ? "–" : "✓"}</span>
                          </button>
                          <button type="button" onClick={() => toggleGroupOpen(group.key)}
                            className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 text-left">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-black text-ink">{fmtDate(group.createdAt)}{group.code ? ` · ${group.code}` : ""}</span>
                              <span className="block truncate text-[11px] font-bold text-ink-mute">{group.broadcast || "방송 정보 없음"} · {group.rows.length}줄</span>
                            </span>
                            <span className="shrink-0 text-[12px] font-black text-ink-mute">{expanded ? "▴" : "▾"}</span>
                          </button>
                        </div>

                        {expanded ? (
                          <div className="divide-y divide-line border-t border-line">
                            {group.rows.map((row) => {
                              const id = String(row.id);
                              const on = checkedIds.includes(id);
                              return (
                                <button key={id} type="button" onClick={() => toggleId(id)}
                                  className={`flex w-full items-center gap-2 py-2 pl-3 pr-3 text-left ${on ? "bg-danger-bg/60" : "bg-surface hover:bg-surface-2"}`}>
                                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-[12px] font-black ${on ? "border-danger-tx/40 bg-[var(--color-danger-tx)] text-white" : "border-line bg-surface text-transparent"}`}>✓</span>
                                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{rowItemLabel(row)}</span>
                                  <span className="shrink-0 whitespace-nowrap text-[12px] font-black text-ink-soft">{rowMoney(row)}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {keptItems.length > 0 ? (
                <div className="mt-2 rounded-xl border border-line bg-surface-2 p-3">
                  <div className="text-[11px] font-black text-ink-soft">예전에 적어둔 품목</div>
                  <div className="mt-1 space-y-1">
                    {keptItems.map((item, index) => (
                      <div key={`${item}-${index}`} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-ink">{item}</span>
                        <button type="button" onClick={() => setKeptItems((prev) => prev.filter((_, i) => i !== index))}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-black text-ink-mute hover:bg-line/40">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ③ 메모 */}
          <div className="mt-5">
            <div className="text-[13px] font-black text-ink">{picksItems ? "③" : "②"} 메모 <span className="font-bold text-ink-mute">(선택)</span></div>
            <textarea value={memo} onChange={(event) => setMemo(event.target.value)}
              placeholder="예: 연락 두절 / 3번 독촉 / 번호 바꿔서 또 옴"
              className="mt-2 min-h-[72px] w-full resize-none rounded-xl border border-line bg-surface p-3 text-[13px] font-bold text-ink outline-none focus:border-danger-tx/45" />
          </div>

          {/* 저장될 내용 미리보기 */}
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
            <div className="text-[11px] font-black text-ink-soft">차단목록에 이렇게 남습니다</div>
            <pre className="mt-1 whitespace-pre-wrap break-words text-[12px] font-bold leading-5 text-ink">{finalReason || "아직 아무것도 안 골랐어요"}</pre>
          </div>

          {errorMessage ? (
            <div className="mt-3 rounded-xl bg-danger-bg px-3 py-2 text-[12px] font-black text-danger-tx">{errorMessage}</div>
          ) : null}
        </div>

        {/* 발 */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving}
            className="h-11 rounded-xl border border-line bg-surface px-5 text-[13px] font-black text-ink-soft hover:bg-surface-2 disabled:opacity-50">취소</button>
          <button type="button" onClick={() => onSubmit(clean(finalReason))} disabled={saving || !canSave}
            className="h-11 rounded-xl bg-[var(--color-danger-tx)] px-5 text-[13px] font-black text-white disabled:bg-danger-bg disabled:text-danger-tx">
            {saving ? "저장중…" : "차단 저장"}
          </button>
        </div>
      </section>
    </div>
  );
}
