"use client";

// [2026-09-30] 고객이슈 기타 「관련 상품」 — 등록상품 고르기 + 직접 입력(주문상세와 같은 방식·부품 재사용).
//   ⚠ 이슈 저장·표시만. 재고·주문·돈 무접촉(rpc/insert/update 없음). 사진은 productId 로 매번 조회(저장 안 함).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveProductImageUrl } from "./quick-product/productImageUrl";
import LiveOrderRegisteredProductPicker from "./LiveOrderRegisteredProductPicker";
import type { LiveOrderRegisteredAddInput } from "./useLiveOrderItemAdd";
import type { IssueExtraItem } from "@/lib/issueTaskPatch";

const won = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
const optOf = (c: string, s: string) => [c, s].map((v) => String(v || "").trim()).filter((v) => v && v !== "없음").join("/");

export default function IssueExtraItems({ value, onChange }: { value: IssueExtraItem[]; onChange: (next: IssueExtraItem[]) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [directOpen, setDirectOpen] = useState(false);
  const [form, setForm] = useState({ productName: "", color: "", size: "", qty: "1", unitPrice: "" });
  const [photos, setPhotos] = useState<Record<string, string>>({});

  // 등록상품 사진 — productId 로 조회(picker 와 같은 이미지 규칙). 저장 안 함.
  const regIds = useMemo(() => Array.from(new Set(value.filter((v) => v.source === "registered" && v.productId).map((v) => v.productId))), [value]);
  useEffect(() => {
    let stop = false;
    if (regIds.length === 0) { setPhotos({}); return; }
    (async () => {
      try {
        const { data } = await supabase.from("products").select("*").in("id", regIds);
        if (stop || !Array.isArray(data)) return;
        const next: Record<string, string> = {};
        for (const p of data as Record<string, unknown>[]) {
          const id = String((p as { id?: unknown }).id ?? "");
          const direct = String(p.image_url ?? p.cover_image_url ?? p.main_image_url ?? p.thumbnail_url ?? "").trim();
          if (direct) next[id] = resolveProductImageUrl(direct);
        }
        setPhotos(next);
      } catch { /* 사진은 보조 표시 */ }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regIds.join(",")]);

  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const addRegistered = async (input: LiveOrderRegisteredAddInput): Promise<boolean> => {
    onChange([...value, { source: "registered", productId: String(input.productId), productName: input.productName, color: input.color || "", size: input.size || "", qty: Math.max(1, input.qty || 1), unitPrice: input.unitPrice ?? null }]);
    setPickerOpen(false);
    return true;
  };
  const addDirect = () => {
    const name = form.productName.trim();
    if (!name) return;
    const qty = Math.max(1, parseInt(form.qty || "1", 10) || 1);
    const up = form.unitPrice.trim() ? Math.max(0, parseInt(form.unitPrice, 10) || 0) : null;
    onChange([...value, { source: "custom", productId: "", productName: name, color: form.color.trim(), size: form.size.trim(), qty, unitPrice: up }]);
    setForm({ productName: "", color: "", size: "", qty: "1", unitPrice: "" });
    setDirectOpen(false);
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {value.length > 0 ? (
        <div className="rounded-xl border border-line">
          {value.map((it, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-line px-2 py-2 last:border-b-0">
              {it.source === "registered" && photos[it.productId] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={photos[it.productId]} alt="" className="h-[46px] w-[46px] shrink-0 rounded-xl border border-line object-cover" loading="lazy" />
              ) : it.source === "custom" ? (
                <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-[11px] font-black text-ink-mute">직접</span>
              ) : <span className="h-[46px] w-[46px] shrink-0 rounded-xl border border-line bg-surface-2" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-black text-ink">{it.productName}</span>
                <span className="block truncate text-[13px] text-ink-mute">{optOf(it.color, it.size) ? `${optOf(it.color, it.size)} · ` : ""}{it.qty}개</span>
              </span>
              {it.unitPrice != null ? <span className="shrink-0 text-right text-[14px] font-black text-ink">{won(it.unitPrice * it.qty)}</span> : null}
              <button type="button" aria-label="추가한 상품 빼기" onClick={() => removeAt(i)} className="h-8 w-8 shrink-0 rounded-lg text-[14px] font-black text-ink-mute hover:bg-danger-bg hover:text-danger-tx">✕</button>
            </div>
          ))}
        </div>
      ) : null}

      {directOpen ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-2">
          <input value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} placeholder="상품명" className="rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep" />
          <div className="flex gap-2">
            <input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} placeholder="색상(선택)" className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep" />
            <input value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} placeholder="사이즈(선택)" className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep" />
          </div>
          <div className="flex gap-2">
            <input value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" placeholder="수량" className="w-20 rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep" />
            <input value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value.replace(/[^\d]/g, "") }))} inputMode="numeric" placeholder="단가(원·선택)" className="flex-1 rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-rose-deep" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={addDirect} className="flex-1 rounded-lg bg-rose-deep px-3 py-2 text-[13px] font-black text-white">추가</button>
            <button type="button" onClick={() => setDirectOpen(false)} className="rounded-lg border border-line px-3 py-2 text-[13px] font-black text-ink-soft">닫기</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPickerOpen(true)} className="h-10 rounded-xl border border-line text-[14px] font-black text-ink-soft hover:bg-surface-2">+ 등록상품에서 고르기</button>
          <button type="button" onClick={() => setDirectOpen(true)} className="h-10 rounded-xl border border-line text-[14px] font-black text-ink-soft hover:bg-surface-2">+ 직접 입력</button>
        </div>
      )}

      {pickerOpen ? <LiveOrderRegisteredProductPicker onAdd={addRegistered} onClose={() => setPickerOpen(false)} adding={false} title="관련 상품 고르기" confirmLabel="목록에 추가" /> : null}
    </div>
  );
}
