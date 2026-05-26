"use client";

import { useMemo, useState } from "react";

type ProductKind = "broadcast" | "group";
type DeliveryType = "normal" | "vendor" | "separate";

const SIZE_PRESETS = {
  clothes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  top: ["90", "95", "100", "105", "110"],
  shoes: [
    "220",
    "225",
    "230",
    "235",
    "240",
    "245",
    "250",
    "255",
    "260",
    "265",
    "270",
    "275",
    "280",
    "285",
    "290",
  ],
};

function splitOptions(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,/|\n\s]+/g)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export default function LiveProductRegistrationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectOrderEnabled, setSelectOrderEnabled] = useState(true);
  const [productKind, setProductKind] = useState<ProductKind>("broadcast");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("normal");
  const [colors, setColors] = useState("");
  const [sizes, setSizes] = useState("");
  const [stockEnabled, setStockEnabled] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [visible, setVisible] = useState(true);
  const [soldOut, setSoldOut] = useState(false);

  const parsedColors = useMemo(() => splitOptions(colors), [colors]);
  const parsedSizes = useMemo(() => splitOptions(sizes), [sizes]);

  const applyPreset = (key: keyof typeof SIZE_PRESETS) => {
    setSizes(SIZE_PRESETS[key].join(", "));
  };

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-black text-slate-950">
              방송상품 · 공구상품 등록
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
              1차 UI
            </span>
            <span
              className={[
                "rounded-full px-2.5 py-1 text-[11px] font-black",
                selectOrderEnabled
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              선택형 주문 {selectOrderEnabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="mt-1 text-[12px] font-bold text-slate-500">
            방송 중 상품을 빠르게 등록하는 작업창입니다. 지금 단계는 저장 없이 화면 구조만 확인합니다.
          </p>
        </div>

        <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-black text-blue-700">
          {isOpen ? "접기 ▲" : "열기 ▼"}
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <div>
              <p className="text-[13px] font-black text-slate-900">
                선택형 주문서 사용
              </p>
              <p className="mt-0.5 text-[12px] font-bold text-slate-500">
                ON이면 고객이 상품을 선택해서 담고, OFF면 기존 직접입력 주문서를 사용합니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectOrderEnabled((value) => !value)}
              className={[
                "rounded-full px-4 py-2 text-[12px] font-black",
                selectOrderEnabled
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200",
              ].join(" ")}
            >
              {selectOrderEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setProductKind("broadcast")}
                  className={[
                    "rounded-full px-3 py-1.5 text-[12px] font-black",
                    productKind === "broadcast"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  방송상품
                </button>
                <button
                  type="button"
                  onClick={() => setProductKind("group")}
                  className={[
                    "rounded-full px-3 py-1.5 text-[12px] font-black",
                    productKind === "group"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  공구상품
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-slate-600">
                    상품명
                  </span>
                  <input
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                    placeholder="예: 룰루레몬 밴딩 바지"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-slate-600">
                    판매가
                  </span>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 px-3 focus-within:border-blue-400">
                    <input
                      className="min-w-0 flex-1 text-[13px] font-bold outline-none"
                      inputMode="numeric"
                      placeholder="0"
                    />
                    <span className="text-[12px] font-black text-slate-400">
                      원
                    </span>
                  </div>
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-slate-600">
                    색상 옵션
                  </span>
                  <input
                    value={colors}
                    onChange={(event) => setColors(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                    placeholder="블랙, 레드, 화이트"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {parsedColors.length ? (
                      parsedColors.map((color) => (
                        <span
                          key={color}
                          className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600"
                        >
                          {color}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] font-bold text-slate-400">
                        쉼표, 띄어쓰기, 줄바꿈으로 자동 옵션화
                      </span>
                    )}
                  </div>
                </label>

                <div>
                  <span className="mb-1 block text-[12px] font-black text-slate-600">
                    사이즈 옵션
                  </span>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPreset("clothes")}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600"
                    >
                      XS~XXXL
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("top")}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600"
                    >
                      90~110
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("shoes")}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600"
                    >
                      신발 220~290
                    </button>
                  </div>
                  <input
                    value={sizes}
                    onChange={(event) => setSizes(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                    placeholder="S, M, L 또는 240, 245"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {parsedSizes.length ? (
                      parsedSizes.slice(0, 16).map((size) => (
                        <span
                          key={size}
                          className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700"
                        >
                          {size}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] font-bold text-slate-400">
                        프리셋 또는 직접입력 가능
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-slate-600">
                    배송유형
                  </span>
                  <select
                    value={deliveryType}
                    onChange={(event) =>
                      setDeliveryType(event.target.value as DeliveryType)
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                  >
                    <option value="normal">일반배송</option>
                    <option value="vendor">업체배송</option>
                    <option value="separate">합배송불가/별도배송</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-slate-600">
                    사진
                  </span>
                  <button
                    type="button"
                    className="h-11 w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 text-[12px] font-black text-slate-500"
                  >
                    사진 없음 / 업로드는 2차
                  </button>
                </label>

                <div>
                  <span className="mb-1 block text-[12px] font-black text-slate-600">
                    상태
                  </span>
                  <div className="flex h-11 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisible((value) => !value)}
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-black",
                        visible
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500",
                      ].join(" ")}
                    >
                      {visible ? "노출" : "숨김"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSoldOut((value) => !value)}
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-black",
                        soldOut
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-500",
                      ].join(" ")}
                    >
                      {soldOut ? "품절" : "판매중"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPinned((value) => !value)}
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-black",
                        pinned
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500",
                      ].join(" ")}
                    >
                      {pinned ? "상단고정" : "고정OFF"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-[12px] font-black text-slate-600">
                  <input
                    type="checkbox"
                    checked={stockEnabled}
                    onChange={(event) => setStockEnabled(event.target.checked)}
                  />
                  재고관리 사용
                </label>

                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-6 py-3 text-[13px] font-black text-white shadow-sm"
                >
                  상품등록 UI 확인
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-black text-slate-900">
                    등록상품 미리보기
                  </p>
                  <p className="text-[11px] font-bold text-slate-500">
                    실제 저장/정렬은 다음 단계에서 연결합니다.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                  샘플 3개
                </span>
              </div>

              <div className="space-y-2">
                {[
                  "룰루레몬 밴딩 바지",
                  "라메르 크림 100ml",
                  "데일리 베이직 스니커즈",
                ].map((name, index) => (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-black text-slate-900">
                        {index === 0 ? "📌 " : ""}
                        {name}
                      </p>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                        방송상품 · 노출중 · 일반배송
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="rounded-lg bg-white px-2 py-1 text-[11px] font-black text-slate-500 ring-1 ring-slate-200"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-white px-2 py-1 text-[11px] font-black text-slate-500 ring-1 ring-slate-200"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-800">
                1차는 화면 자리와 사용 흐름 확인 단계입니다. 주문/입금/정산 데이터에는 연결하지 않습니다.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
