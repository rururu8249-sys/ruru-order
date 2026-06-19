"use client";

type LiveProductStockEditorProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  stockText: string;
  onStockTextChange: (value: string) => void;
  colorOptions: string[];
  sizeOptions: string[];
  sizeOptionDisabled: boolean;
};

function onlyDigits(value: string): string {
  return String(value || "").replace(/[^0-9]/g, "");
}

function formatNumberInput(value: string): string {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

function buildOptionPreview(
  colors: string[],
  sizes: string[],
  sizeOptionDisabled: boolean,
): string[] {
  const safeColors = colors.length ? colors : ["색상 없음"];
  const safeSizes = sizeOptionDisabled || !sizes.length ? ["사이즈 없음"] : sizes;

  return safeColors.flatMap((color) =>
    safeSizes.map((size) => `${color} / ${size}`),
  );
}

export default function LiveProductStockEditor({
  enabled,
  onEnabledChange,
  stockText,
  onStockTextChange,
  colorOptions,
  sizeOptions,
  sizeOptionDisabled,
}: LiveProductStockEditorProps) {
  const previews = buildOptionPreview(colorOptions, sizeOptions, sizeOptionDisabled);
  const visiblePreviews = previews.slice(0, 18);
  const hiddenCount = Math.max(0, previews.length - visiblePreviews.length);

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[12px] font-black text-ink">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          재고관리 사용
        </label>

        {enabled ? (
          <label className="flex items-center gap-2">
            <span className="text-[11px] font-black text-ink-soft">
              전체 재고수량
            </span>
            <input
              value={stockText}
              onChange={(event) => onStockTextChange(formatNumberInput(event.target.value))}
              inputMode="numeric"
              className="h-9 w-28 rounded-xl border border-line bg-surface px-3 text-right text-[13px] font-black text-ink outline-none focus:border-blue-400"
              placeholder="0"
            />
            <span className="text-[11px] font-black text-ink-soft">개</span>
          </label>
        ) : (
          <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-black text-ink-mute ring-1 ring-line">
            재고 미사용
          </span>
        )}
      </div>

      {enabled ? (
        <div className="mt-3 rounded-xl bg-surface px-3 py-2 ring-1 ring-line">
          <p className="text-[11px] font-black text-ink">
            옵션별 재고 설계 미리보기
          </p>
          <p className="mt-1 text-[10px] font-bold leading-relaxed text-ink-soft">
            지금은 전체 재고수량만 products.stock에 저장합니다. 색상/사이즈별 차감은 다음 단계에서 별도 variant 테이블을 만든 뒤 주문저장 로직과 분리해서 연결해야 안전합니다.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {visiblePreviews.map((item) => (
              <span
                key={item}
                className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-black text-ink-soft"
              >
                {item}
              </span>
            ))}
            {hiddenCount ? (
              <span className="rounded-full bg-rose-soft px-2 py-1 text-[10px] font-black text-rose-deep">
                +{hiddenCount}개
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
