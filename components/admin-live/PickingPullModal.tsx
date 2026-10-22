"use client";

// [2026-10-22 사장님] 「오늘 챙기기에 넣기」 창 — 주문상세·고객이슈 공용.
//   지난 주문의 상품 줄을 골라 오늘 주문서·송장·물건챙기기에 넣는다(복사·날짜 변경 없음, 돈 무접촉).
//   저장은 /api/admin-live/picking-pull (pull) 한 곳.
import { useMemo, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";
import { pickPullAwayText, pulledForOf, shortDateWithWeekday } from "@/lib/orderPickPull";

export type PickingPullLine = {
  id: string;
  productName: string;
  option: string;
  qty: number;
  /** 이미 다른 날로 가져간 줄이면 그 날짜(YYYY-MM-DD) */
  pulledFor?: string | null;
  pulledAt?: string | null;
  canceled?: boolean;
};

type Props = {
  orderNo: string;
  nickname: string;
  name?: string;
  /** 원래 주문일(ISO) — 「지난 주문 10.18(토)」 표기용 */
  orderedAt: string | null;
  lines: PickingPullLine[];
  /** 미리 체크할 줄 id (없으면 전부) */
  preselectIds?: string[];
  /** 사유 기본값(「고객이슈 교환」 등) */
  defaultReason?: string;
  onClose: () => void;
  /** 저장 성공 뒤(목록 새로고침용) */
  onDone?: (updatedIds: number[]) => void | Promise<void>;
};

const clean = (v: unknown) => String(v ?? "").trim();

export default function PickingPullModal({ orderNo, nickname, name, orderedAt, lines, preselectIds, defaultReason, onClose, onDone }: Props) {
  const selectable = useMemo(() => lines.filter((l) => !l.canceled), [lines]);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const base = preselectIds && preselectIds.length ? preselectIds : selectable.map((l) => l.id);
    return new Set(base.filter((id) => selectable.some((l) => l.id === id)));
  });
  const [reason, setReason] = useState(clean(defaultReason) || "직접 선택");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const todayKey = pulledForOf({ pick_pulled_at: new Date().toISOString() });
  const when = shortDateWithWeekday(orderedAt);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = selectable.length > 0 && selectable.every((l) => selected.has(l.id));

  const submit = async () => {
    if (saving) return;
    const ids = selectable.filter((l) => selected.has(l.id)).map((l) => Number(l.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) { showAdminToast("가져올 상품 줄을 골라 주세요.", "warning"); return; }
    const finalReason = [clean(reason) || "직접 선택", clean(memo)].filter(Boolean).join(" · ").slice(0, 80);
    setSaving(true);
    try {
      const res = await fetch("/api/admin-live/picking-pull", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pull", rowIds: ids, reason: finalReason }) });
      const payload = await res.json().catch(() => null) as { ok?: boolean; message?: string; updated?: number[]; skipped?: { id: number; why: string }[] } | null;
      if (!res.ok || !payload?.ok) throw new Error(payload?.message || "가져오기에 실패했어요.");
      const updated = Array.isArray(payload.updated) ? payload.updated : [];
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      if (updated.length === 0) throw new Error(skipped[0]?.why ? `가져오지 못했어요: ${skipped[0].why}` : "가져온 줄이 없어요.");
      showAdminToast(`${updated.length}줄을 오늘(${shortDateWithWeekday(todayKey)}) 챙기기에 넣었어요.${skipped.length ? ` (${skipped.length}줄 제외: ${skipped[0].why})` : ""}\n오늘 주문서·송장·물건챙기기에 「지난 주문 ${when}」 표시로 보여요.`, "success");
      await onDone?.(updated);
      onClose();
    } catch (error) {
      showAdminToast(error instanceof Error ? error.message : "가져오기에 실패했어요.", "error");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-2xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="오늘 챙기기에 넣기">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[20px] font-bold text-ink">오늘 챙기기에 넣기</h2>
            <p className="mt-0.5 text-[13px] text-ink-soft">{nickname}{name && name !== nickname ? ` · ${name}` : ""} · 주문 {orderNo}{when ? ` · 주문일 ${when}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="h-9 w-9 rounded-lg text-[18px] text-ink-soft hover:bg-surface-2">×</button>
        </div>
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-soft">
          고른 상품 줄이 <b className="text-ink">오늘({shortDateWithWeekday(todayKey)}) 주문서·송장·물건챙기기</b>에 「지난 주문 {when || "날짜"} · 사유」 표시로 들어가요. 주문·금액·입금·주문상태는 바뀌지 않아요.
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-ink-mute">상품 줄 {selectable.length}</span>
          {selectable.length > 1 ? (
            <button type="button" onClick={() => setSelected(allOn ? new Set() : new Set(selectable.map((l) => l.id)))} className="text-[12px] font-bold text-ink underline underline-offset-2">{allOn ? "전체 해제" : "전체 선택"}</button>
          ) : null}
        </div>
        <div className="mt-1 max-h-[40vh] space-y-1 overflow-y-auto">
          {lines.length === 0 ? <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-mute">상품 줄을 찾지 못했어요.</div> : null}
          {lines.map((l) => {
            const on = selected.has(l.id);
            const pulledDay = pulledForOf({ pick_pulled_for: l.pulledFor ?? null, pick_pulled_at: l.pulledAt ?? null });
            return (
              <label key={l.id} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${l.canceled ? "opacity-50" : ""} ${on ? "border-ink bg-surface" : "border-line bg-surface"}`}>
                <input type="checkbox" checked={on} disabled={Boolean(l.canceled)} onChange={() => toggle(l.id)} className="h-5 w-5 accent-[var(--color-ink)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-ink">{l.productName}</span>
                  <span className="block text-[12px] text-ink-soft">{[l.option, `${l.qty}개`].filter(Boolean).join(" · ")}{l.canceled ? " · 취소된 줄" : ""}</span>
                  {pulledDay ? <span className="mt-0.5 inline-block rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-soft">{pulledDay === todayKey ? "이미 오늘 챙기기에 있음" : `이미 ${pickPullAwayText(pulledDay)}`}</span> : null}
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2">
          <label className="grid gap-1 text-[13px] font-semibold text-ink-mute">사유
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={40} placeholder="예: 늦게 입고 · 고객이슈 교환" className="h-11 rounded-lg border border-line bg-surface px-3 text-[14px] font-normal text-ink" />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold text-ink-mute">메모(선택)
            <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={40} placeholder="예: 사이즈 M → L" className="h-11 rounded-lg border border-line bg-surface px-3 text-[14px] font-normal text-ink" />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-line bg-surface px-4 text-[14px] font-bold text-ink-soft">취소</button>
          <button type="button" onClick={() => void submit()} disabled={saving || selected.size === 0} className="h-11 rounded-lg bg-ink px-4 text-[14px] font-bold text-white disabled:opacity-40">
            {saving ? "넣는 중…" : `${selected.size}줄 오늘 챙기기에 넣기`}
          </button>
        </div>
      </div>
    </div>
  );
}
