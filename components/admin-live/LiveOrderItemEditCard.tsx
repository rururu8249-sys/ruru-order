"use client";

import { useState } from "react";
import type { LiveOrderItem } from "./types";
import {
  createInitialLiveOrderItemEditForm,
  type LiveOrderItemEditForm,
  useLiveOrderItemEdit,
} from "./useLiveOrderItemEdit";

type Props = {
  item: LiveOrderItem;
  index: number;
  disabled?: boolean;
  onAfterSave?: () => void | Promise<void>;
};

function money(value: unknown) {
  return `₩${Number(value || 0).toLocaleString("ko-KR")}`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function onlyNumber(value: unknown) {
  return String(value ?? "").replace(/[^\d]/g, "");
}

function getItemName(item: LiveOrderItem) {
  return clean(item.productName) || "상품명 없음";
}

function getOptionText(item: LiveOrderItem) {
  const color = clean(item.color);
  const size = clean(item.size);

  if (color || size) return [color, size].filter(Boolean).join(" / ");

  return clean(item.optionText) || "옵션 없음";
}

function editCountText(item: LiveOrderItem) {
  const productCount = Number(item.productEditCount || 0);
  const amountCount = Number(item.amountEditCount || 0);

  if (productCount <= 0 && amountCount <= 0) return "";

  return `상품수정 ${productCount}회 · 금액수정 ${amountCount}회`;
}

function updateForm<K extends keyof LiveOrderItemEditForm>(
  form: LiveOrderItemEditForm,
  key: K,
  value: LiveOrderItemEditForm[K]
) {
  return {
    ...form,
    [key]: value,
  };
}

export default function LiveOrderItemEditCard({ item, index, disabled = false, onAfterSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => createInitialLiveOrderItemEditForm(item));
  const { savingItemId, saveItem } = useLiveOrderItemEdit(onAfterSave);
  const saving = savingItemId === String(item.id);

  const qty = Number(onlyNumber(form.qty) || 0);
  const unitPrice = Number(onlyNumber(form.unitPrice) || 0);
  const previewProductTotal = qty * unitPrice;
  const countText = editCountText(item);

  const cancelEdit = () => {
    setForm(createInitialLiveOrderItemEditForm(item));
    setEditing(false);
  };

  const submit = async () => {
    const ok = await saveItem({ item, form });
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-black text-blue-700">#{index + 1} 상품 수정</div>
          {countText ? <div className="text-[11px] font-black text-slate-400">{countText}</div> : null}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <label className="grid gap-1">
            <span className="text-[11px] font-black text-slate-500">상품명</span>
            <input
              value={form.productName}
              onChange={(event) => setForm((prev) => updateForm(prev, "productName", event.target.value))}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-400"
              placeholder="상품명"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-[11px] font-black text-slate-500">색상</span>
              <input
                value={form.color}
                onChange={(event) => setForm((prev) => updateForm(prev, "color", event.target.value))}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-400"
                placeholder="색상"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-[11px] font-black text-slate-500">사이즈</span>
              <input
                value={form.size}
                onChange={(event) => setForm((prev) => updateForm(prev, "size", event.target.value))}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-400"
                placeholder="사이즈"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-[11px] font-black text-slate-500">수량</span>
              <input
                value={form.qty}
                inputMode="numeric"
                onChange={(event) => setForm((prev) => updateForm(prev, "qty", onlyNumber(event.target.value)))}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-400"
                placeholder="1"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-[11px] font-black text-slate-500">판매단가</span>
              <input
                value={Number(form.unitPrice || 0).toLocaleString("ko-KR")}
                inputMode="numeric"
                onChange={(event) => setForm((prev) => updateForm(prev, "unitPrice", onlyNumber(event.target.value)))}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-400"
                placeholder="19000"
              />
            </label>
          </div>
        </div>

        <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600">
          수정 후 상품금액: <span className="text-blue-700">{money(previewProductTotal)}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="h-10 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-10 rounded-xl bg-blue-600 text-xs font-black text-white hover:bg-blue-700 disabled:bg-slate-300"
          >
            {saving ? "저장중..." : "저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black leading-5 text-slate-950">{getItemName(item)}</div>
          <div className="mt-1 whitespace-pre-line text-xs font-bold leading-5 text-slate-500">
            {getOptionText(item)}
          </div>
          {countText ? (
            <div className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
              {countText}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-black text-slate-950">{Number(item.qty || 1)}개</div>
          <div className="mt-1 text-sm font-black text-slate-950">{money(item.amount)}</div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={disabled}
            className="mt-2 rounded-xl bg-slate-950 px-2.5 py-1.5 text-[11px] font-black text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            수정
          </button>
        </div>
      </div>
    </div>
  );
}
