"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { adminCatalogWrite } from "@/lib/adminCatalogWrite";
import { showAdminToast } from "@/lib/adminToast";
import LiveProductImageUploader, { type UploadedProductImage } from "./LiveProductImageUploader";
import LiveProductStockEditor from "./LiveProductStockEditor";

type ProductKind = "broadcast" | "group";
type DeliveryType = "normal" | "vendor";

type LiveProductRegistrationPanelProps = {
  activeBroadcastId?: string | number | null;
};

type ProductRow = {
  id: string | number;
  name?: string | null;
  price?: number | null;
  stock?: number | null;
  product_type?: string | null;
  status?: string | null;
  shipping_type?: string | null;
  sort_order?: number | null;
  is_pinned?: boolean | null;
  image_url?: string | null;
  color_options?: string[] | null;
  size_options?: string[] | null;
  size_option_enabled?: boolean | null;
  delivery_group_key?: string | null;
  product_description?: string | null;
  detail_image_urls?: string[] | null;
};

const SIZE_PRESETS = {
  clothes: ["XS", "S", "M", "L", "XL", "XXL"],
  top: ["90", "95", "100", "105", "110", "115"],
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
  free: ["FREE"],
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

function onlyDigits(value: string): string {
  return String(value || "").replace(/[^0-9]/g, "");
}

function formatNumberInput(value: string): string {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

function numberFromMoneyText(value: string): number {
  const digits = onlyDigits(value);
  return digits ? Number(digits) : 0;
}

function productKindLabel(kind: ProductKind) {
  return kind === "broadcast" ? "방송상품" : "공구상품";
}

function deliveryTypeLabel(type: DeliveryType) {
  return type === "vendor" ? "업체배송" : "일반배송";
}

function statusLabel(visible: boolean, soldOut: boolean) {
  if (!visible) return "숨김";
  if (soldOut) return "품절";
  return "판매중";
}

export default function LiveProductRegistrationPanel({
  activeBroadcastId,
}: LiveProductRegistrationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectOrderEnabled, setSelectOrderEnabled] = useState(true);
  const [productKind, setProductKind] = useState<ProductKind>("broadcast");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("normal");
  const [name, setName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [colors, setColors] = useState("");
  const [sizes, setSizes] = useState("");
  const [sizeOptionDisabled, setSizeOptionDisabled] = useState(false);
  const [stockEnabled, setStockEnabled] = useState(false);
  const [stockText, setStockText] = useState("");
  const [pinned, setPinned] = useState(false);
  const [visible, setVisible] = useState(true);
  const [soldOut, setSoldOut] = useState(false);
  const [deliveryGroupKey, setDeliveryGroupKey] = useState("");
  const [productNote, setProductNote] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [coverImages, setCoverImages] = useState<UploadedProductImage[]>([]);
  const [detailImages, setDetailImages] = useState<UploadedProductImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [recentProducts, setRecentProducts] = useState<ProductRow[]>([]);

  const parsedColors = useMemo(() => splitOptions(colors), [colors]);
  const parsedSizes = useMemo(
    () => (sizeOptionDisabled ? [] : splitOptions(sizes)),
    [sizeOptionDisabled, sizes],
  );

  const noneOptionAutofillEnabled =
    colors.trim() === "없음" && !sizeOptionDisabled && sizes.trim() === "없음";

  const toggleNoneOptionAutofill = () => {
    if (noneOptionAutofillEnabled) {
      setColors("");
      setSizes("");
      setSizeOptionDisabled(false);
      return;
    }

    setColors("없음");
    setSizes("없음");
    setSizeOptionDisabled(false);
  };


  const loadRecentProducts = useCallback(async () => {
    setLoadingProducts(true);

    const { data, error } = await supabase
      .from("products")
      .select(
        "id,name,price,stock,product_type,status,shipping_type,sort_order,is_pinned,image_url,color_options,size_options,size_option_enabled,delivery_group_key,product_description,detail_image_urls",
      )
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: false })
      .limit(12);

    if (error) {
      console.error("상품 목록 조회 실패", error.message);
      showAdminToast("상품 목록 조회 실패\n\n" + error.message, "error");
      setLoadingProducts(false);
      return;
    }

    setRecentProducts((data || []) as ProductRow[]);
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadRecentProducts();
  }, [isOpen, loadRecentProducts]);

  const applyPreset = (key: keyof typeof SIZE_PRESETS) => {
    setSizeOptionDisabled(false);
    setSizes(SIZE_PRESETS[key].join(", "));
  };

  const toggleSizeOptionDisabled = () => {
    setSizeOptionDisabled((current) => {
      const next = !current;
      if (next) setSizes("");
      return next;
    });
  };

  const resetForm = () => {
    setName("");
    setPriceText("");
    setColors("");
    setSizes("");
    setSizeOptionDisabled(false);
    setDeliveryType("normal");
    setStockEnabled(false);
    setStockText("");
    setPinned(false);
    setVisible(true);
    setSoldOut(false);
    setDeliveryGroupKey("");
    setProductNote("");
    setProductDescription("");
    setCoverImages([]);
    setDetailImages([]);
  };

  const saveProduct = async () => {
    const cleanName = name.trim();
    const price = numberFromMoneyText(priceText);
    const cleanDeliveryGroupKey = deliveryGroupKey.trim();
    const stockQuantity = stockEnabled ? numberFromMoneyText(stockText) : 0;

    if (!cleanName) {
      showAdminToast("상품명을 입력해주세요.", "warning");
      return;
    }

    if (price < 1) {
      showAdminToast("판매가는 1원 이상 입력해주세요.", "warning");
      return;
    }

    if (productKind === "broadcast" && !activeBroadcastId) {
      showAdminToast("현재 방송이 없어 방송상품 연결을 할 수 없습니다.\n방송 시작 후 등록해주세요.", "warning");
      return;
    }

    if (deliveryType === "vendor" && !cleanDeliveryGroupKey) {
      showAdminToast("업체배송은 배송그룹을 입력해주세요.\n예: vendor_lamer, vendor_a", "warning");
      return;
    }

    const nextProductType = productKindLabel(productKind);
    const nextShippingType = deliveryTypeLabel(deliveryType);
    const nextStatus = statusLabel(visible, soldOut);
    const colorOptions = parsedColors;
    const sizeOptions = sizeOptionDisabled ? [] : parsedSizes;

    setSaving(true);

    try {
      const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true });

      const nextSortOrder = Number(count || 0) + 1;

      const payload = {
        name: cleanName,
        price,
        stock: stockQuantity,
        status: nextStatus,
        product_type: nextProductType,
        shipping_type: nextShippingType,
        sort_order: nextSortOrder,
        color_options: colorOptions,
        size_options: sizeOptions,
        size_option_enabled: !sizeOptionDisabled,
        is_pinned: pinned,
        image_url: coverImages[0]?.url || "",
        image_path: coverImages[0]?.path || null,
        delivery_group_key: deliveryType === "vendor" ? cleanDeliveryGroupKey : null,
        product_note: productNote.trim() || null,
        product_description: productDescription.trim() || null,
        detail_image_urls: detailImages.map((image) => image.url),
      };

      const { data: insertedProduct, error: productError } = await adminCatalogWrite({
        table: "products",
        op: "insert",
        values: payload,
        select: "id",
        single: true,
      });

      if (productError) {
        throw new Error(productError.message);
      }

      if (productKind === "broadcast") {
        const productId = insertedProduct?.id;

        if (!productId) {
          throw new Error("상품 ID를 확인하지 못했습니다.");
        }

        const { data: existingLink, error: linkCheckError } = await supabase
          .from("broadcast_products")
          .select("id")
          .eq("broadcast_id", activeBroadcastId)
          .eq("product_id", productId)
          .limit(1);

        if (linkCheckError) {
          throw new Error(linkCheckError.message);
        }

        if (!existingLink || existingLink.length === 0) {
          const { error: linkError } = await adminCatalogWrite({
            table: "broadcast_products",
            op: "insert",
            values: {
              broadcast_id: activeBroadcastId,
              product_id: productId,
            },
          });

          if (linkError) {
            throw new Error(linkError.message);
          }
        }
      }

      showAdminToast(
        productKind === "broadcast"
          ? "방송상품을 저장하고 현재 방송에 연결했습니다."
          : "공구상품을 저장했습니다.",
        "success",
      );

      resetForm();
      await loadRecentProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      showAdminToast("상품 저장 실패\n\n" + message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[22px] border border-line bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-black text-ink">
              방송상품 · 공구상품 등록
            </span>
            <span className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] font-black text-info-tx">
              저장 연결
            </span>
            <span
              className={[
                "rounded-full px-2.5 py-1 text-[11px] font-black",
                selectOrderEnabled
                  ? "bg-ok-bg text-ok-tx"
                  : "bg-surface-2 text-ink-soft",
              ].join(" ")}
            >
              선택형 주문 {selectOrderEnabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="mt-1 text-[12px] font-bold text-ink-soft">
            상품 저장·사진 등록 전용입니다. 고객 주문서/배송비/정산 연결은 아직 건드리지 않습니다.
          </p>
        </div>

        <span className="rounded-full border border-line px-3 py-1.5 text-[12px] font-black text-info-tx">
          {isOpen ? "접기 ▲" : "열기 ▼"}
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-line px-5 pb-5 pt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
            <div>
              <p className="text-[13px] font-black text-ink">
                선택형 주문서 사용
              </p>
              <p className="mt-0.5 text-[12px] font-bold text-ink-soft">
                현재는 관리자 상품 저장 단계입니다. 고객 주문서 노출은 다음 단계에서 별도로 연결합니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectOrderEnabled((value) => !value)}
              className={[
                "rounded-full px-4 py-2 text-[12px] font-black",
                selectOrderEnabled
                  ? "bg-rose-deep text-white"
                  : "bg-surface text-ink-soft ring-1 ring-line",
              ].join(" ")}
            >
              {selectOrderEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-line p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_170px]">
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setProductKind("broadcast")}
                      className={[
                        "rounded-full px-3 py-1.5 text-[12px] font-black",
                        productKind === "broadcast"
                          ? "bg-rose-deep text-white"
                          : "bg-surface-2 text-ink-soft",
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
                          ? "bg-rose-deep text-white"
                          : "bg-surface-2 text-ink-soft",
                      ].join(" ")}
                    >
                      공구상품
                    </button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                    <label className="block">
                      <span className="mb-1 block text-[12px] font-black text-ink-soft">
                        상품명
                      </span>
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="h-11 w-full rounded-xl border border-line px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                        placeholder="예: 룰루레몬 밴딩 바지"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[12px] font-black text-ink-soft">
                        판매가
                      </span>
                      <div className="flex h-11 items-center rounded-xl border border-line px-3 focus-within:border-blue-400">
                        <input
                          value={priceText}
                          onChange={(event) => setPriceText(formatNumberInput(event.target.value))}
                          className="min-w-0 flex-1 text-[13px] font-bold outline-none"
                          inputMode="numeric"
                          placeholder="0"
                        />
                        <span className="text-[12px] font-black text-ink-mute">
                          원
                        </span>
                      </div>
                    </label>
                  </div>

                  <label className="mt-3 block">
                    <span className="mb-1 block text-[12px] font-black text-ink-soft">
                      상품 메모
                    </span>
                    <input
                      value={productNote}
                      onChange={(event) => setProductNote(event.target.value)}
                      className="h-11 w-full rounded-xl border border-line px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                      placeholder="고객 노출용 짧은 안내 또는 관리자 메모"
                    />
                  </label>
                </div>

                <LiveProductImageUploader
                  label="노출 썸네일"
                  helpText="고객 리스트 대표사진"
                  kind="cover"
                  images={coverImages}
                  onChange={setCoverImages}
                  compact
                  mode="square"
                />
              </div>

              <div data-ruru-live-none-toggle className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-2 p-3">
                <button
                  type="button"
                  aria-pressed={noneOptionAutofillEnabled}
                  onClick={toggleNoneOptionAutofill}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-black transition active:scale-[0.98]",
                    noneOptionAutofillEnabled
                      ? "bg-rose-deep text-white shadow-sm ring-2 ring-blue-100"
                      : "bg-surface text-ink-soft ring-1 ring-line hover:bg-surface-2",
                  ].join(" ")}
                >
                  {noneOptionAutofillEnabled ? "없음입력 ON" : "없음입력 OFF"}
                </button>
                <span className="text-xs font-bold text-ink-soft">
                  ON이면 고객 주문서에서 색상/사이즈가 없음으로 자동입력됩니다.
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-ink-soft">
                    색상 옵션
                  </span>
                  <input
                    value={colors}
                    onChange={(event) => setColors(event.target.value)}
                    className="h-11 w-full rounded-xl border border-line px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                    placeholder="블랙, 레드, 화이트"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {parsedColors.length ? (
                      parsedColors.map((color) => (
                        <span
                          key={color}
                          className="rounded-full bg-surface-2 px-2 py-1 text-[11px] font-black text-ink-soft"
                        >
                          {color}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] font-bold text-ink-mute">
                        쉼표, 띄어쓰기, 줄바꿈으로 자동 옵션화
                      </span>
                    )}
                  </div>
                </label>

                <div>
                  <span className="mb-1 block text-[12px] font-black text-ink-soft">
                    사이즈 옵션
                  </span>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPreset("clothes")}
                      className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black text-ink-soft"
                    >
                      XS~XXL
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("top")}
                      className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black text-ink-soft"
                    >
                      90~115
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("shoes")}
                      className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black text-ink-soft"
                    >
                      신발 220~290
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset("free")}
                      className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black text-ink-soft"
                    >
                      FREE
                    </button>
                  </div>

                  <input
                    value={sizes}
                    onChange={(event) => {
                      setSizeOptionDisabled(false);
                      setSizes(event.target.value);
                    }}
                    disabled={sizeOptionDisabled}
                    className={[
                      "h-11 w-full rounded-xl border border-line px-3 text-[13px] font-bold outline-none focus:border-blue-400",
                      sizeOptionDisabled ? "bg-surface-2 text-ink-mute" : "",
                    ].join(" ")}
                    placeholder={sizeOptionDisabled ? "사이즈 옵션 없이 등록" : "S, M, L 또는 240, 245 / 필요시 직접 입력"}
                  />

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sizeOptionDisabled ? (
                      <span className="rounded-full bg-surface-2 px-2 py-1 text-[11px] font-black text-ink-soft">
                        사이즈 옵션 없음
                      </span>
                    ) : parsedSizes.length ? (
                      parsedSizes.slice(0, 20).map((size) => (
                        <span
                          key={size}
                          className="rounded-full bg-info-bg px-2 py-1 text-[11px] font-black text-info-tx"
                        >
                          {size}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] font-bold text-ink-mute">
                        빠른 버튼 선택 후 필요하면 직접 수정
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-ink-soft">
                    배송유형
                  </span>
                  <select
                    value={deliveryType}
                    onChange={(event) =>
                      setDeliveryType(event.target.value as DeliveryType)
                    }
                    className="h-11 w-full rounded-xl border border-line px-3 text-[13px] font-bold outline-none focus:border-blue-400"
                  >
                    <option value="normal">일반배송</option>
                    <option value="vendor">업체배송</option>
                  </select>
                  <p className="mt-1 text-[11px] font-bold text-ink-mute">
                    업체배송은 타 상품과 합배송불가/배송비 별도 기준입니다.
                  </p>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-ink-soft">
                    업체배송 그룹
                  </span>
                  <input
                    value={deliveryGroupKey}
                    onChange={(event) => setDeliveryGroupKey(event.target.value)}
                    disabled={deliveryType !== "vendor"}
                    className={[
                      "h-11 w-full rounded-xl border border-line px-3 text-[13px] font-bold outline-none focus:border-blue-400",
                      deliveryType !== "vendor" ? "bg-surface-2 text-ink-mute" : "",
                    ].join(" ")}
                    placeholder={deliveryType === "vendor" ? "예: vendor_lamer" : "일반배송은 입력 안 함"}
                  />
                </label>

                <div>
                  <span className="mb-1 block text-[12px] font-black text-ink-soft">
                    상태
                  </span>
                  <div className="flex h-11 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisible((value) => !value)}
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-black",
                        visible
                          ? "bg-ok-bg text-ok-tx"
                          : "bg-surface-2 text-ink-soft",
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
                          ? "bg-rose-soft text-rose-deep"
                          : "bg-surface-2 text-ink-soft",
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
                          ? "bg-warn-bg text-warn-tx"
                          : "bg-surface-2 text-ink-soft",
                      ].join(" ")}
                    >
                      {pinned ? "상단고정" : "고정OFF"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-black text-ink-soft">
                    상품상세설명
                  </span>
                  <textarea
                    value={productDescription}
                    onChange={(event) => setProductDescription(event.target.value)}
                    className="min-h-[160px] w-full resize-y rounded-xl border border-line px-3 py-3 text-[13px] font-bold leading-relaxed outline-none focus:border-blue-400"
                    placeholder="고객이 상품 상세에서 볼 설명을 입력하세요. 예: 소재, 핏, 주의사항, 교환/환불 안내 등"
                  />
                </label>

                <LiveProductImageUploader
                  label="상품상세사진"
                  helpText="상세용 여러 장 사진"
                  kind="detail"
                  multiple
                  images={detailImages}
                  onChange={setDetailImages}
                  compact
                  mode="square"
                />
              </div>

              <LiveProductStockEditor
                enabled={stockEnabled}
                onEnabledChange={setStockEnabled}
                stockText={stockText}
                onStockTextChange={setStockText}
                colorOptions={parsedColors}
                sizeOptions={parsedSizes}
                sizeOptionDisabled={sizeOptionDisabled}
              />

              <div className="mt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={saveProduct}
                  disabled={saving}
                  className="rounded-xl bg-rose-deep px-6 py-3 text-[13px] font-black text-white shadow-sm disabled:cursor-wait disabled:opacity-50"
                >
                  {saving ? "저장중..." : "상품 등록"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-black text-ink">
                    최근 등록상품
                  </p>
                  <p className="text-[11px] font-bold text-ink-soft">
                    상단고정/노출순서 기준으로 표시합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadRecentProducts}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-black text-ink-soft"
                >
                  새로고침
                </button>
              </div>

              <div className="space-y-2">
                {loadingProducts ? (
                  <div className="rounded-xl bg-surface-2 px-3 py-6 text-center text-[12px] font-black text-ink-mute">
                    상품 목록 불러오는 중
                  </div>
                ) : recentProducts.length ? (
                  recentProducts.map((product) => (
                    <div
                      key={String(product.id)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-line">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt="최근 등록상품"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm">
                              🛍️
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-black text-ink">
                            {product.is_pinned ? "📌 " : ""}
                            {product.name || "상품명 없음"}
                          </p>
                          <p className="mt-0.5 text-[11px] font-bold text-ink-soft">
                            {(product.product_type || "상품")} · {product.status || "-"} · {product.shipping_type || "-"}
                          </p>
                          <p className="mt-0.5 text-[11px] font-black text-info-tx">
                            {Number(product.price || 0).toLocaleString("ko-KR")}원 · 재고 {Number(product.stock || 0).toLocaleString("ko-KR")}개
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold text-ink-mute">
                            상세설명 {product.product_description ? "있음" : "없음"} · 상세사진 {Array.isArray(product.detail_image_urls) ? product.detail_image_urls.length : 0}장
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 rounded-lg bg-surface px-2 py-1 text-[11px] font-black text-ink-soft ring-1 ring-line">
                        #{product.sort_order || product.id}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-surface-2 px-3 py-6 text-center text-[12px] font-black text-ink-mute">
                    등록된 상품이 없거나 조회되지 않았습니다.
                  </div>
                )}
              </div>

              <div className="mt-3 rounded-xl bg-warn-bg px-3 py-2 text-[11px] font-bold leading-relaxed text-warn-tx">
                고객 주문서 노출과 배송비 계산은 다음 단계에서 별도 연결합니다.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
