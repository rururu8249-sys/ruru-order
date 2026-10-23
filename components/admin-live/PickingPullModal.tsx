"use client";

// [2026-10-22 사장님] 지난 주문 줄을 다른 날 챙기기에 넣는 창 — 주문상세·고객이슈 공용.
// [2026-10-23 사장님 「헷갈려 죽겠어」] «출고 넘기기»로 다시 설계.
//   예전: 버튼 누른 «날짜»로만 기록 → 주문서를 방송으로 보면 안 보였다.
//   지금: 「어느 출고에 넣을까요?」에서 방송(지금 방송·최근 방송) 또는 쇼핑몰 주문 날짜를 직접 고른다.
//   주문 복사·날짜 변경·돈 무접촉. 저장은 /api/admin-live/picking-pull (pull) 한 곳(넘길 곳 이름은 서버가 만든다).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { kstDateKeyOf, pickPullAwayText, pulledForOf, pullTargetLabelForBroadcast, shortDateWithWeekday } from "@/lib/orderPickPull";

export type PickingPullLine = {
  id: string;
  productName: string;
  option: string;
  qty: number;
  /** 이미 다른 출고로 넘긴 줄이면 그 날짜(YYYY-MM-DD)·이름 */
  pulledFor?: string | null;
  pulledAt?: string | null;
  pulledTarget?: string | null;
  canceled?: boolean;
};

type Props = {
  orderNo: string;
  nickname: string;
  name?: string;
  /** 원래 주문일(ISO) */
  orderedAt: string | null;
  lines: PickingPullLine[];
  /** 미리 체크할 줄 id (없으면 전부) */
  preselectIds?: string[];
  /** 사유 기본값(「교환 재발송」 등) */
  defaultReason?: string;
  onClose: () => void;
  /** 저장 성공 뒤(목록 새로고침용) */
  onDone?: (updatedIds: number[]) => void | Promise<void>;
};

type BroadcastOption = { id: string; label: string; live: boolean };

const clean = (v: unknown) => String(v ?? "").trim();
const REASON_CHIPS = ["늦게 입고", "교환 재발송", "빠진 상품 재발송"];

export default function PickingPullModal({ orderNo, nickname, name, orderedAt, lines, preselectIds, defaultReason, onClose, onDone }: Props) {
  const selectable = useMemo(() => lines.filter((l) => !l.canceled), [lines]);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const base = preselectIds && preselectIds.length ? preselectIds : selectable.map((l) => l.id);
    return new Set(base.filter((id) => selectable.some((l) => l.id === id)));
  });
  const [reason, setReason] = useState(clean(defaultReason));
  const [saving, setSaving] = useState(false);
  const todayKey = kstDateKeyOf(new Date());
  const when = shortDateWithWeekday(orderedAt);

  // 넘길 곳 — 방송 목록(최근 10개) + 쇼핑몰 주문 날짜
  const [broadcasts, setBroadcasts] = useState<BroadcastOption[] | null>(null);
  const [target, setTarget] = useState<string>(""); // "bc:<id>" | "date"
  const [shopDate, setShopDate] = useState(todayKey);
  const [showAllBroadcasts, setShowAllBroadcasts] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("broadcasts").select("id, public_title, started_at, status").neq("is_deleted", true).order("started_at", { ascending: false }).limit(10);
      if (!alive) return;
      const list = ((data as Array<Record<string, unknown>>) || []).map((b) => ({
        id: String(b.id),
        label: pullTargetLabelForBroadcast(String(b.public_title || ""), String(b.started_at || "")),
        live: String(b.status || "").toUpperCase() === "ON",
      }));
      setBroadcasts(list);
      // 기본: 지금 방송 → 없으면 가장 최근 방송 → 없으면 쇼핑몰 오늘
      const pick = list.find((b) => b.live) || list[0];
      setTarget((cur) => cur || (pick ? `bc:${pick.id}` : "date"));
    })();
    return () => { alive = false; };
  }, []);

  const targetLabel = target.startsWith("bc:")
    ? broadcasts?.find((b) => `bc:${b.id}` === target)?.label || "고른 방송"
    : `${shortDateWithWeekday(shopDate)} 쇼핑몰 주문`;

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = selectable.length > 0 && selectable.every((l) => selected.has(l.id));

  const submit = async () => {
    if (saving) return;
    const ids = selectable.filter((l) => selected.has(l.id)).map((l) => Number(l.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) { showAdminToast("넘길 상품을 골라 주세요.", "warning"); return; }
    if (!target) { showAdminToast("어느 출고에 넣을지 골라 주세요.", "warning"); return; }
    const body = {
      action: "pull",
      rowIds: ids,
      reason: clean(reason) || "직접 선택",
      target: target.startsWith("bc:") ? { type: "broadcast", broadcastId: target.slice(3) } : { type: "date", date: shopDate },
    };
    setSaving(true);
    try {
      const res = await fetch("/api/admin-live/picking-pull", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await res.json().catch(() => null) as { ok?: boolean; message?: string; updated?: number[]; skipped?: { id: number; why: string }[]; target?: string } | null;
      if (!res.ok || !payload?.ok) throw new Error(payload?.message || "출고 넘기기에 실패했어요.");
      const updated = Array.isArray(payload.updated) ? payload.updated : [];
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      if (updated.length === 0) throw new Error(skipped[0]?.why ? `넘기지 못했어요: ${skipped[0].why}` : "넘긴 상품이 없어요.");
      showAdminToast(`${updated.length}개를 ${payload.target || targetLabel} 출고로 넘겼어요.${skipped.length ? ` (${skipped.length}개 제외: ${skipped[0].why})` : ""}\n그 주문서·송장·물건챙기기에 「지난 주문」으로 보여요.`, "success");
      await onDone?.(updated);
      onClose();
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : "출고 넘기기에 실패했어요.", "error");
    } finally { setSaving(false); }
  };

  const rowCls = (on: boolean) => `flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left ${on ? "border-ink" : "border-line"} bg-surface`;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 sm:items-center sm:p-3" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-[520px] flex-col rounded-t-xl bg-surface sm:rounded-xl" style={{ boxShadow: "0 8px 24px rgba(0,0,0,.08)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="출고 넘기기">
        <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold text-ink">출고 넘기기</h2>
            <p className="mt-0.5 truncate text-[13px] text-ink-soft">{nickname}{name && name !== nickname ? ` · ${name}` : ""} · {when ? `${when} 주문` : "주문"} {orderNo}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="h-10 w-10 shrink-0 rounded-lg text-[20px] text-ink-soft hover:bg-surface-2">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-[13px] text-ink-soft">고른 상품을 다른 출고 때 같이 챙기고 송장을 뽑아요. 주문·금액·입금은 그대로예요.</p>

          {/* 1. 넘길 곳 */}
          <div className="mt-4 text-[13px] font-semibold text-ink">어느 출고에 넣을까요?</div>
          <div className="mt-2 space-y-1.5">
            {broadcasts === null ? <div className="px-1 py-2 text-[13px] text-ink-mute">방송 목록을 불러오는 중…</div> : null}
            {(broadcasts || []).filter((b, i) => showAllBroadcasts || i < 4 || target === `bc:${b.id}`).map((b) => {
              const on = target === `bc:${b.id}`;
              return (
                <button key={b.id} type="button" onClick={() => setTarget(`bc:${b.id}`)} className={rowCls(on)} aria-pressed={on}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-ink" : "border-line"}`}>{on ? <span className="h-2.5 w-2.5 rounded-full bg-ink" /> : null}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{b.label}</span>
                  {b.live ? <span className="shrink-0 text-[12px] font-semibold text-danger-tx">방송 중</span> : null}
                </button>
              );
            })}
            {(broadcasts || []).length > 4 && !showAllBroadcasts ? (
              <button type="button" onClick={() => setShowAllBroadcasts(true)} className="h-9 px-1 text-[13px] font-semibold text-ink-soft">이전 방송 더 보기</button>
            ) : null}
            <div className={rowCls(target === "date")} onClick={() => setTarget("date")} role="button" aria-pressed={target === "date"}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${target === "date" ? "border-ink" : "border-line"}`}>{target === "date" ? <span className="h-2.5 w-2.5 rounded-full bg-ink" /> : null}</span>
              <span className="shrink-0 text-[14px] font-semibold text-ink">쇼핑몰 주문</span>
              <input type="date" value={shopDate} onChange={(e) => { setShopDate(e.target.value || todayKey); setTarget("date"); }} onClick={(e) => e.stopPropagation()} className="ml-auto h-9 rounded-lg border border-line bg-surface px-2 text-[14px] text-ink" aria-label="쇼핑몰 주문 날짜" />
            </div>
          </div>

          {/* 2. 넘길 상품 */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">넘길 상품</span>
            {selectable.length > 1 ? (
              <button type="button" onClick={() => setSelected(allOn ? new Set() : new Set(selectable.map((l) => l.id)))} className="h-8 px-1 text-[13px] font-semibold text-ink-soft">{allOn ? "전체 해제" : "전체 선택"}</button>
            ) : null}
          </div>
          <div className="mt-1 space-y-1.5">
            {lines.length === 0 ? <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-mute">상품을 찾지 못했어요.</div> : null}
            {lines.map((l) => {
              const on = selected.has(l.id);
              const pulledDay = pulledForOf({ pick_pulled_for: l.pulledFor ?? null, pick_pulled_at: l.pulledAt ?? null });
              return (
                <label key={l.id} className={`${rowCls(on)} ${l.canceled ? "opacity-50" : ""}`}>
                  <input type="checkbox" checked={on} disabled={Boolean(l.canceled)} onChange={() => toggle(l.id)} className="h-5 w-5 shrink-0 accent-[var(--color-ink)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{l.productName}</span>
                    <span className="block text-[13px] text-ink-soft">{[l.option, `${l.qty}개`].filter(Boolean).join(" · ")}{l.canceled ? " · 취소된 상품" : ""}</span>
                    {pulledDay ? <span className="block text-[12px] text-ink-mute">이미 {pickPullAwayText(pulledDay, l.pulledTarget)} — 다시 고르면 바뀐 곳으로 옮겨요</span> : null}
                  </span>
                </label>
              );
            })}
          </div>

          {/* 3. 사유 */}
          <div className="mt-4 text-[13px] font-semibold text-ink">사유</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REASON_CHIPS.map((c) => (
              <button key={c} type="button" onClick={() => setReason(c)} className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${reason === c ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft"}`}>{c}</button>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={60} placeholder="직접 적기 (예: 사이즈 M → L 교환)" className="mt-2 h-11 w-full rounded-lg border border-line bg-surface px-3 text-[16px] text-ink" />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink">취소</button>
          <button type="button" onClick={() => void submit()} disabled={saving || selected.size === 0 || !target} className="h-10 rounded-lg bg-ink px-4 text-[14px] font-bold text-white disabled:opacity-40">
            {saving ? "넘기는 중…" : `${selected.size}개 넘기기`}
          </button>
        </div>
      </div>
    </div>
  );
}
