"use client";

import { useEffect, useState } from "react";
import { formatOrderOptionText, stripNoneOptionParts } from "@/lib/orderOptionText";
import { supabase } from "@/lib/supabase";
import { choiceExists, normChoice, readOrderItemOptionChoices, sizesForColor, type OrderItemOptionChoices } from "@/lib/orderItemOptionChoices";
import type { LiveOrderItem } from "./types";
import {
  createInitialLiveOrderItemEditForm,
  type LiveOrderItemEditForm,
  type LiveOrderItemEditSaveResult,
  useLiveOrderItemEdit,
} from "./useLiveOrderItemEdit";

type Props = {
  item: LiveOrderItem;
  index: number;
  disabled?: boolean;
  onAfterSave?: (result: LiveOrderItemEditSaveResult) => void | Promise<void>;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: () => void;
  // [2026-08-31 사장님 요청] 등록상품 사진 — 있으면 작게 보여주고, 누르면 크게(부모가 띄움)
  imageUrl?: string | null;
  onImageClick?: (url: string) => void;
  // [2026-09-03 사장님 요청] 칸 제목 상품(예: 상품번호)이면 색상 칸 라벨을 그 제목으로 — 표시 전용
  colorLabel?: string;
  // [2026-10-22 사장님] 환불·반품 이슈 대상 줄 — 상품명 취소선 + 빨간 라벨(표시 전용·수정/저장 무관)
  issueMark?: { label: string; strike: boolean; resolved?: boolean } | null;
};

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function eulReul(word: string) {
  const code = String(word || "").trim().slice(-1).charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 > 0 ? "을" : "를";
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
  // [2026-08-31 사장님 지시] "없음 / 6" 금지 → 없음 숨기고 「사이즈 6」으로. 없으면 아예 표시 안 함.
  return formatOrderOptionText(item.color, item.size) || stripNoneOptionParts(item.optionText);
}


function formatHistoryDate(value: unknown) {
  const date = new Date(String(value || ""));

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistoryValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "number") {
    return value.toLocaleString("ko-KR");
  }

  return String(value);
}

function compactChangeLine(entry: any) {
  const before = entry?.before || {};
  const after = entry?.after || {};

  const beforeText = [
    before.product_name,
    before.color,
    before.size,
    before.qty ? `${before.qty}개` : "",
    before.adjusted_total_price ? `${Number(before.adjusted_total_price).toLocaleString("ko-KR")}원` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  const afterText = [
    after.product_name,
    after.color,
    after.size,
    after.qty ? `${after.qty}개` : "",
    after.adjusted_total_price ? `${Number(after.adjusted_total_price).toLocaleString("ko-KR")}원` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    beforeText: beforeText || "-",
    afterText: afterText || "-",
  };
}

function editCountText(item: LiveOrderItem) {
  const productCount = Number(item.productEditCount || 0);
  const amountCount = Number(item.amountEditCount || 0);

  if (productCount <= 0 && amountCount <= 0) return "";

  // [E3] 0회 항목은 생략(둘 다 0이면 위에서 이미 배지 숨김).
  return [productCount > 0 ? `상품수정 ${productCount}회` : "", amountCount > 0 ? `금액수정 ${amountCount}회` : ""].filter(Boolean).join(" · ");
}

function inventoryItemStatusInfo(item: LiveOrderItem) {
  const restoreStatus = clean(item.inventoryRestoreStatus).toLowerCase();
  const deductionStatus = clean(item.inventoryDeductionStatus).toLowerCase();

  if (restoreStatus === "restored_total" || restoreStatus === "restored_option" || item.inventoryRestoredAt) {
    return {
      label: "재고복구완료",
      memo: item.inventoryRestoreMemo || "주문취소 재고복구 완료",
      className: "border-info-tx/35 bg-info-bg text-info-tx",
    };
  }

  if (deductionStatus === "deducted_total" || deductionStatus === "deducted_option" || item.inventoryDeductedAt) {
    return {
      label: deductionStatus === "deducted_total" ? "총재고 차감완료" : "옵션재고 차감완료",
      memo: item.inventoryDeductionMemo || "재고차감 완료",
      className: "border-ok-tx bg-ok-bg text-ok-tx",
    };
  }

  if (deductionStatus.startsWith("skipped_")) {
    return {
      label: "재고차감 제외",
      memo: item.inventoryDeductionMemo || "직접입력/재고관리 OFF 등으로 재고차감 제외",
      className: "border-line bg-surface-2 text-ink-soft",
    };
  }

  return null;
}

function isInventoryLockedItem(item: LiveOrderItem) {
  const restoreStatus = clean(item.inventoryRestoreStatus).toLowerCase();

  return (
    restoreStatus === "restored_total" ||
    restoreStatus === "restored_option" ||
    Boolean(item.inventoryRestoredAt)
  );
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

export default function LiveOrderItemEditCard({ item, index, disabled = false, onAfterSave, canDelete = false, deleting = false, onDelete, imageUrl = null, onImageClick, colorLabel = "", issueMark = null }: Props) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState(() => createInitialLiveOrderItemEditForm(item));
  const { savingItemId, saveItem } = useLiveOrderItemEdit(onAfterSave);
  const saving = savingItemId === String(item.id);

  const qty = Number(onlyNumber(form.qty) || 0);
  const unitPrice = Number(onlyNumber(form.unitPrice) || 0);
  const previewProductTotal = qty * unitPrice;
  const countText = editCountText(item);
  const hasChangeHistory = Array.isArray(item.changeHistory) && item.changeHistory.length > 0;
  const inventoryLocked = isInventoryLockedItem(item);
  // [2026-09-03] 칸 제목이 있으면 편집칸 라벨·접힌 줄 앞에 그 제목 표시(저장 필드는 color 그대로)
  const colorFieldLabel = clean(colorLabel) || "색상";
  // [2026-09-03 사장님 요청] 옵션 안 쓰는 상품은 빈 색상/사이즈 칸을 굳이 띄우지 않는다 —
  //   주문에 실값이 없으면 칸을 접고 「＋ 추가」 버튼만. 표시 전용(저장 필드·로직 무변경).
  const itemHasRealColor = formatOrderOptionText(item.color, "") !== "";
  const itemHasRealSize = formatOrderOptionText("없음", item.size) !== "";
  const [showColorField, setShowColorField] = useState(false);
  const [showSizeField, setShowSizeField] = useState(false);
  // [2026-10-27] 색상·사이즈는 그 상품의 지금 재고표에서 고르기 — 오타·옛 옵션 이름으로 저장되는 것 방지.
  //   못 읽거나(직접입력·브랜드 묶음·조합형·재고관리 OFF) 「직접 입력」을 누르면 예전 입력칸.
  const [choices, setChoices] = useState<OrderItemOptionChoices | null>(null);
  const [manualOption, setManualOption] = useState(false);
  useEffect(() => {
    if (!editing || !item.productId) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("products").select("id,product_note").eq("id", Number(item.productId)).maybeSingle();
      if (alive) setChoices(readOrderItemOptionChoices(data as { product_note?: unknown } | null));
    })();
    return () => { alive = false; };
  }, [editing, item.productId]);
  const pickMode = Boolean(choices) && !manualOption;
  const currentMissing = Boolean(choices) && !choiceExists(choices as OrderItemOptionChoices, item.color, item.size);
  const pickedOk = !pickMode || choiceExists(choices as OrderItemOptionChoices, form.color, form.size);
  const optionTextView = (() => {
    const base = getOptionText(item);
    if (!base) return "";
    return clean(colorLabel) && formatOrderOptionText(item.color, "") ? `${clean(colorLabel)} ${base}` : base;
  })();

  const cancelEdit = () => {
    setForm(createInitialLiveOrderItemEditForm(item));
    setManualOption(false);
    setEditing(false);
  };

  const submit = async () => {
    if (!pickedOk) return;
    const ok = await saveItem({ item, form });
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className="overflow-hidden rounded-xl border-2 border-ink bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-bold text-ink">상품 {index + 1} 수정{pickMode ? " — 바꿀 옵션을 고르세요" : ""}</div>
          {countText ? (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="rounded-full bg-warn-bg px-2 py-1 text-[11px] font-bold text-warn-tx">
                {countText}
              </span>
              {hasChangeHistory ? (
                <button
                  type="button"
                  onClick={() => setShowHistory((prev) => !prev)}
                  className="rounded-full border border-warn-tx bg-surface px-2 py-1 text-[11px] font-bold text-warn-tx hover:bg-warn-bg"
                >
                  {showHistory ? "이력닫기" : "수정이력 보기"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] font-bold text-ink-soft">상품명</span>
            <input
              value={form.productName}
              onChange={(event) => setForm((prev) => updateForm(prev, "productName", event.target.value))}
              className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[14px] font-medium outline-none focus:border-ink"
              placeholder="상품명"
            />
          </label>

          {pickMode && choices ? (
            <div className="grid grid-cols-1 gap-2">
              {currentMissing ? (
                <p className="rounded-lg bg-warn-bg px-3 py-2 text-[13px] font-semibold text-warn-tx">
                  지금 옵션 「{formatOrderOptionText(item.color, item.size) || "없음"}」은 상품에 없어요(이름이 바뀌었을 수 있어요). 아래에서 지금 옵션으로 골라 주세요.
                </p>
              ) : null}
              {choices.hasColor ? (
                <label className="grid min-w-0 gap-1">
                  <span className="text-[13px] font-semibold text-ink-soft">{colorFieldLabel}</span>
                  <select
                    value={choices.colors.includes(normChoice(form.color)) ? normChoice(form.color) : ""}
                    onChange={(event) => {
                      const color = event.target.value;
                      const sizes = sizesForColor(choices, color);
                      setForm((prev) => {
                        const keepSize = sizes.some((r) => r.size === normChoice(prev.size));
                        return { ...prev, color, size: choices.hasSize ? (keepSize ? normChoice(prev.size) : sizes.length === 1 ? sizes[0].size : "") : "" };
                      });
                    }}
                    className="h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[16px] font-medium text-ink outline-none focus:border-ink"
                  >
                    <option value="">{colorFieldLabel}{eulReul(colorFieldLabel)} 고르세요</option>
                    {choices.colors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ) : null}
              {choices.hasSize ? (() => {
                const sizes = choices.hasColor ? sizesForColor(choices, form.color) : choices.rows.filter((r) => r.size && !r.color);
                const disabledSize = choices.hasColor && !normChoice(form.color);
                return (
                  <label className="grid min-w-0 gap-1">
                    <span className="text-[13px] font-semibold text-ink-soft">사이즈</span>
                    <select
                      value={sizes.some((r) => r.size === normChoice(form.size)) ? normChoice(form.size) : ""}
                      disabled={disabledSize}
                      onChange={(event) => setForm((prev) => updateForm(prev, "size", event.target.value))}
                      className="h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[16px] font-medium text-ink outline-none focus:border-ink disabled:bg-surface-2 disabled:text-ink-mute"
                    >
                      <option value="">{disabledSize ? `${colorFieldLabel}부터 고르세요` : "사이즈를 고르세요"}</option>
                      {sizes.map((r) => <option key={r.size} value={r.size}>{r.size} · 재고 {r.stock}</option>)}
                    </select>
                  </label>
                );
              })() : null}
              {!pickedOk ? <p className="text-[13px] text-warn-tx">옵션을 골라야 저장돼요.</p> : null}
              <button type="button" onClick={() => setManualOption(true)} className="w-fit text-[13px] font-semibold text-ink-mute underline underline-offset-2 hover:text-ink">
                직접 입력
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-2">
            {itemHasRealColor || showColorField ? (
            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] font-bold text-ink-soft">{colorFieldLabel}</span>
              <input
                value={form.color}
                onChange={(event) => setForm((prev) => updateForm(prev, "color", event.target.value))}
                className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[14px] font-medium outline-none focus:border-ink"
                placeholder={colorFieldLabel}
              />
            </label>
            ) : (
            <button type="button" onClick={() => setShowColorField(true)} className="w-fit rounded-lg border border-dashed border-line bg-surface px-2 py-1 text-left text-[11px] font-bold text-ink-mute hover:bg-surface-2">
              ＋ {colorFieldLabel} 추가 — 이 주문엔 {colorFieldLabel} 없음
            </button>
            )}

            {itemHasRealSize || showSizeField ? (
            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] font-bold text-ink-soft">사이즈</span>
              <input
                value={form.size}
                onChange={(event) => setForm((prev) => updateForm(prev, "size", event.target.value))}
                className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[14px] font-medium outline-none focus:border-ink"
                placeholder="사이즈"
              />
            </label>
            ) : (
            <button type="button" onClick={() => setShowSizeField(true)} className="w-fit rounded-lg border border-dashed border-line bg-surface px-2 py-1 text-left text-[11px] font-bold text-ink-mute hover:bg-surface-2">
              ＋ 사이즈 추가 — 이 주문엔 사이즈 없음
            </button>
            )}
          </div>
          )}
          {choices && manualOption ? (
            <button type="button" onClick={() => { setManualOption(false); setForm((prev) => ({ ...prev, color: item.color || "", size: item.size || "" })); }} className="w-fit text-[13px] font-semibold text-ink-mute underline underline-offset-2 hover:text-ink">
              목록에서 고르기
            </button>
          ) : null}

          <div className="grid grid-cols-1 gap-2">
            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] font-bold text-ink-soft">수량</span>
              <input
                value={form.qty}
                inputMode="numeric"
                onChange={(event) => setForm((prev) => updateForm(prev, "qty", onlyNumber(event.target.value)))}
                className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[14px] font-medium outline-none focus:border-ink"
                placeholder="1"
              />
            </label>

            <label className="grid min-w-0 gap-1">
              <span className="text-[11px] font-bold text-ink-soft">판매단가</span>
              <input
                value={Number(form.unitPrice || 0).toLocaleString("ko-KR")}
                inputMode="numeric"
                onChange={(event) => setForm((prev) => updateForm(prev, "unitPrice", onlyNumber(event.target.value)))}
                className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[14px] font-medium outline-none focus:border-ink"
                placeholder="19000"
              />
            </label>
          </div>
        </div>

        <div className="mt-2 overflow-hidden rounded-xl bg-surface px-3 py-2 text-xs font-bold text-ink-soft">
          수정 후 상품금액: <span className="text-ink">{money(previewProductTotal)}</span>
        </div>


        {showHistory && hasChangeHistory ? (
          <div className="mt-3 rounded-2xl border border-warn-tx bg-warn-bg/50 p-3">
            <div className="mb-2 text-[11px] font-bold text-warn-tx">최근 수정이력</div>
            <div className="grid gap-2">
              {[...(item.changeHistory || [])].slice(-5).reverse().map((entry: any, historyIndex) => {
                const line = compactChangeLine(entry);

                return (
                  <div key={`${item.id}-editing-history-${historyIndex}`} className="rounded-xl bg-surface p-2 text-[11px] leading-5 text-ink-soft">
                    <div className="mb-1 font-bold text-ink-mute">
                      {formatHistoryDate(entry?.changed_at)}
                      {entry?.product_changed ? " · 상품변경" : ""}
                      {entry?.amount_changed ? " · 금액변경" : ""}
                    </div>
                    <div>
                      <span className="font-black text-ink-mute">전</span> {line.beforeText}
                    </div>
                    <div>
                      <span className="font-bold text-ink">후</span> {line.afterText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="h-10 rounded-lg border border-line bg-surface text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || inventoryLocked || !pickedOk}
            className="h-10 rounded-lg bg-ink text-[14px] font-bold text-white disabled:bg-surface-3"
          >
            {inventoryLocked ? "수정잠금" : saving ? "저장중..." : "저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start gap-2">
        {imageUrl ? (
          <button
            type="button"
            onClick={() => onImageClick?.(imageUrl)}
            title="사진 크게 보기"
            className="shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={getItemName(item)} loading="lazy" className="h-12 w-12 object-cover" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className={`break-words text-[14px] font-bold leading-5 ${issueMark?.strike ? "line-through text-ink-mute" : "text-ink"}`}>
            {issueMark ? <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-[11px] font-black no-underline ${issueMark.label === "교환" ? "bg-warn-bg text-warn-tx" : issueMark.label === "출고" || issueMark.label === "기타" ? "bg-surface-2 text-ink-soft" : "bg-danger-bg text-danger-tx"}`} style={{ textDecoration: "none" }}>{issueMark.label}{issueMark.resolved ? " 완료" : ""}</span> : null}
            {getItemName(item)}
          </div>
          {optionTextView ? (
            <div className={`mt-1 whitespace-pre-line break-words text-[13px] leading-5 ${issueMark?.strike ? "line-through text-ink-mute" : "text-ink-soft"}`}>
              {optionTextView}
            </div>
          ) : null}
          {countText ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex rounded-full bg-warn-bg px-2 py-1 text-[11px] font-bold text-warn-tx">
                {countText}
              </span>
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className="rounded-full border border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink-soft hover:bg-surface-2"
              >
                {showHistory ? "이력닫기" : "수정이력 보기"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[13px] text-ink-soft">{Number(item.qty || 1)}개</div>
          <div className="mt-0.5 text-[14px] font-bold tabular-nums text-ink">{money(item.amount)}</div>
          {(() => {
            const inventoryInfo = inventoryItemStatusInfo(item);
            if (!inventoryInfo) return null;

            return (
              <div className={`mt-2 rounded-xl border px-2 py-1 text-left text-[11px] font-bold leading-relaxed ${inventoryInfo.className}`}>
                <div>{inventoryInfo.label}</div>
                <div className="mt-0.5 opacity-80">{inventoryInfo.memo}</div>
              </div>
            );
          })()}
          <div className="mt-2 flex items-center justify-end gap-1.5">
            {canDelete && onDelete && !disabled ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="h-8 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold text-danger-tx hover:bg-surface-2 disabled:opacity-50"
              >
                {deleting ? "삭제중..." : "삭제"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={disabled || inventoryLocked}
              title={inventoryLocked ? "재고복구완료 주문은 상품수정할 수 없습니다." : undefined}
              className="h-8 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              {inventoryLocked ? "수정잠금" : "수정"}
            </button>
          </div>
        </div>
      </div>
      {showHistory && Array.isArray(item.changeHistory) && item.changeHistory.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-warn-tx bg-warn-bg/50 p-3">
          <div className="mb-2 text-[11px] font-bold text-warn-tx">최근 수정이력</div>
          <div className="grid gap-2">
            {[...item.changeHistory].slice(-5).reverse().map((entry: any, historyIndex) => {
              const line = compactChangeLine(entry);

              return (
                <div key={`${item.id}-history-${historyIndex}`} className="rounded-xl bg-surface p-2 text-[11px] leading-5 text-ink-soft">
                  <div className="mb-1 font-bold text-ink-mute">
                    {formatHistoryDate(entry?.changed_at)}
                    {entry?.product_changed ? " · 상품변경" : ""}
                    {entry?.amount_changed ? " · 금액변경" : ""}
                  </div>
                  <div>
                    <span className="font-black text-ink-mute">전</span> {line.beforeText}
                  </div>
                  <div>
                    <span className="font-bold text-ink">후</span> {line.afterText}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
