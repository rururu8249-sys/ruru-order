"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminLiveSettingsNavigation from "./AdminLiveSettingsNav";
import AdminLiveNoticePanel from "./AdminLiveNoticePanel";
import SettingsUnsavedChangesDialog from "./SettingsUnsavedChangesDialog";
import {type SettingsTab,type SettingsDestination} from "./adminLiveSettingsNavigation";
import {useSettingsDraft,type SettingsDraftState} from "./useSettingsDraft";
import YoutubeNotifyCard from "./YoutubeNotifyCard";
import TelegramNotifyCard from "./TelegramNotifyCard";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
// [2026-09-22] 상품 주문 안내 문구 — 문구 원문·기본값은 한 곳(lib)에서만 정한다
import { PRODUCT_NOTICE_PRESETS, PRODUCT_NOTICE_MAX_LEN, parseProductNoticeMode, resolveProductOrderNotice, splitProductOrderNotice, type ProductNoticeMode } from "@/lib/productOrderNotice";
import AdminAuthSettingsPanel from "./AdminAuthSettingsPanel";
import AdminSoundControl from "./AdminSoundControl";
import CombineShippingSettingsTab from "./CombineShippingSettingsTab";
import ShopInfoSettingsTab from "./ShopInfoSettingsTab";
import ProductImageNoticeSettingsTab from "./ProductImageNoticeSettingsTab";
import BroadcastScreenSettingsTab from "./BroadcastScreenSettingsTab";
import { HOWTO_DEFAULT, parseHowtoSteps } from "@/lib/howto";
import {
  FINAL_SUBMIT_CONFIRMATION_KEY,
  parseFinalSubmitConfirmationEnabled,
  toFinalSubmitConfirmationRow,
} from "@/lib/finalSubmitConfirmation";

type SettingKey =
  | "customer_card_extra_rate"
  | "actual_card_fee_rate"
  | "card_payment_min_amount"
  | "default_shipping_fee"
  | "remote_area_shipping_fee"
  | "vendor_shipping_fee"
  | "vendor_remote_area_shipping_fee"
  | "point_auto_earn_enabled"
  | "point_earn_rate"
  | "cart_hold_minutes"
  | "direct_input_enabled"
  | "howto_enabled"
  | "howto_steps"
  | "final_submit_confirmation_enabled"
  | "product_notice_mode"
  | "product_notice_custom";

type SettingRow = {
  key: string;
  value: string | number | null;
};

const SETTING_KEYS: SettingKey[] = [
  "customer_card_extra_rate",
  "actual_card_fee_rate",
  "card_payment_min_amount",
  "default_shipping_fee",
  "remote_area_shipping_fee",
  "vendor_shipping_fee",
  "vendor_remote_area_shipping_fee",
  "point_auto_earn_enabled",
  "point_earn_rate",
  "cart_hold_minutes",
  "direct_input_enabled",
  "howto_enabled",
  "howto_steps",
  FINAL_SUBMIT_CONFIRMATION_KEY,
  "product_notice_mode",
  "product_notice_custom",
];

type NumericSettingKey = Exclude<
  SettingKey,
  | "direct_input_enabled"
  | "howto_enabled"
  | "howto_steps"
  | "final_submit_confirmation_enabled"
  | "product_notice_mode"
  | "product_notice_custom"
>;

const DEFAULTS: Record<NumericSettingKey, number> = {
  customer_card_extra_rate: 10,
  actual_card_fee_rate: 7,
  card_payment_min_amount: 100000,
  default_shipping_fee: 4000,
  remote_area_shipping_fee: 6000,
  // [2026-10-22 사장님 지시] 업체배송비 — 일반 배송비와 따로(일반을 0원 무료배송으로 해도 업체1·업체2 상품엔 이 금액)
  vendor_shipping_fee: 4000,
  vendor_remote_area_shipping_fee: 7000,
  point_auto_earn_enabled: 0,
  point_earn_rate: 0,
  cart_hold_minutes: 15,
};

// [2026-07-13] 장바구니 선점 유지시간 — 분값을 사람이 읽기 좋은 단위로 분해/조립
type HoldUnit = "minute" | "hour" | "day";
const HOLD_UNIT_MULT: Record<HoldUnit, number> = { minute: 1, hour: 60, day: 1440 };
function decomposeHoldMinutes(m: number): { amount: string; unit: HoldUnit } {
  const v = Math.max(1, Math.round(m));
  if (v % 1440 === 0) return { amount: String(v / 1440), unit: "day" };
  if (v % 60 === 0) return { amount: String(v / 60), unit: "hour" };
  return { amount: String(v), unit: "minute" };
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = clean(value).replace(/[^0-9.-]/g, "");
  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
}

function onlyDigits(value: string) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function formatMoneyInput(value: string | number) {
  const digits = onlyDigits(String(value ?? ""));
  if (!digits) return "";

  return Number(digits).toLocaleString();
}

function readNumber(rows: SettingRow[], key: NumericSettingKey) {
  const row = rows.find((item) => item.key === key);
  const value = toNumber(row?.value);

  return value > 0 || clean(row?.value) === "0" ? value : DEFAULTS[key];
}

function SettingInput({
  label,
  desc,
  value,
  suffix,
  onChange,
  type,
  step,
  min,
  max,
  inputMode,
}: {
  label: string;
  desc?: string;
  value: string;
  suffix: string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
  inputMode?: "numeric" | "decimal" | "text";
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <div className="text-sm font-black text-ink">{label}</div>
      {desc ? <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">{desc}</div> : null}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          step={step}
          min={min}
          max={max}
          inputMode={inputMode}
          className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-lg font-black outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft"
        />
        <span className="text-sm font-black text-ink-soft">{suffix}</span>
      </div>
    </div>
  );
}

// 적립률 등 소수점 허용 입력: 숫자 + 소수점 1개만 통과
function decimalInput(value: string) {
  let v = String(value || "").replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  return v;
}

// 설정 카테고리(좌측 네비) — 업계 표준: 카테고리별로 나눠 스크롤 최소화
// 하단 공통 저장바(운영값)를 쓰는 탭 — 유튜브/보안은 자체 저장
const GLOBAL_SAVE_TABS: SettingsTab[] = ["payment", "point", "order"];

type AdminLiveSettingsPanelProps = {
  /** [2026-09-07] 「공지·쪽지 열기」 바로가기 — 대시보드가 메뉴를 바꿔 준다 */
  onOpenNotice?: () => void;
  /** [2026-10-21] 처음 열 화면(예: 옛 「쪽지·공지사항」 주소로 들어오면 공지사항) */
  initialTab?: SettingsTab;
  /** [2026-09-12] 「이벤트 열기」 바로가기 — 방송 화면 탭에서 이벤트 오버레이 주소를 찾아갈 때 */
  onOpenEvent?: () => void;
  onNavigationGuardChange?: (guard:null|(()=>Promise<boolean>)) => void;
};

export default function AdminLiveSettingsPanel({ onOpenNotice, onOpenEvent, onNavigationGuardChange, initialTab }: AdminLiveSettingsPanelProps = {}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "shop");
  const [focusSection,setFocusSection]=useState<"bank"|"payster"|undefined>(initialTab && initialTab !== "shop" ? undefined : "bank");   // [2026-10-21 a1-5] 설정 첫 화면 = 입금계좌
  const [childDraft,setChildDraft]=useState<SettingsDraftState|null>(null);
  const [globalDraftState,setGlobalDraftState]=useState<SettingsDraftState|null>(null);
  const [choiceOpen,setChoiceOpen]=useState(false);
  const pendingRef=useRef<((ok:boolean)=>void)|null>(null);
  const draftRef=useRef<SettingsDraftState|null>(null);

  const [customerCardRate, setCustomerCardRate] = useState(String(DEFAULTS.customer_card_extra_rate));
  const [actualCardRate, setActualCardRate] = useState(String(DEFAULTS.actual_card_fee_rate));
  const [cardMinAmount, setCardMinAmount] = useState(formatMoneyInput(DEFAULTS.card_payment_min_amount));
  const [defaultShippingFee, setDefaultShippingFee] = useState(formatMoneyInput(DEFAULTS.default_shipping_fee));
  const [remoteShippingFee, setRemoteShippingFee] = useState(formatMoneyInput(DEFAULTS.remote_area_shipping_fee));
  const [vendorShippingFee, setVendorShippingFee] = useState(formatMoneyInput(DEFAULTS.vendor_shipping_fee));
  const [vendorRemoteShippingFee, setVendorRemoteShippingFee] = useState(formatMoneyInput(DEFAULTS.vendor_remote_area_shipping_fee));
  const [pointAutoEarn, setPointAutoEarn] = useState(false);
  const [pointEarnRate, setPointEarnRate] = useState(String(DEFAULTS.point_earn_rate));
  // [2026-07-13] 장바구니 선점 유지시간 (분으로 저장, 화면은 분/시간/일 선택)
  const [holdAmount, setHoldAmount] = useState(String(DEFAULTS.cart_hold_minutes));
  const [holdUnit, setHoldUnit] = useState<HoldUnit>("minute");
  const [directInputEnabled, setDirectInputEnabled] = useState(true);
  // [2026-08-30] 접속 팝업 공지 / 주문서 공지 문구는 「공지·쪽지」 메뉴로 옮겼다.
  //   같은 키를 두 화면이 저장하면 한쪽이 다른 쪽을 되돌려버려서, 여기서는 아예 뺐다.
  // [2026-07-10] 주문 방법 팝업 — 켜고/끄기 + 내용 수정
  const [howtoEnabled, setHowtoEnabled] = useState(true);
  const [howtoSteps, setHowtoSteps] = useState(HOWTO_DEFAULT.steps);
  const [howtoWarn, setHowtoWarn] = useState(HOWTO_DEFAULT.warn);
  const [finalSubmitConfirmationEnabled, setFinalSubmitConfirmationEnabled] = useState(true);
  // [2026-09-22 사장님] 상품 주문 안내 문구 — 손님 상품창의 «수량·금액 줄 바로 위»에 한 줄로 뜬다
  const [productNoticeMode, setProductNoticeMode] = useState<ProductNoticeMode>("off");
  const [productNoticeCustom, setProductNoticeCustom] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadSettings() {
      setLoading(true);

      try {
        const { data, error } = await supabase.from("settings").select("key,value").in("key", SETTING_KEYS);

        if (!alive) return;

        if (error) {
          showAdminToast("설정값 불러오기 실패\n\n" + error.message, "error");
          return;
        }

        const rows = (data || []) as SettingRow[];

        setCustomerCardRate(String(readNumber(rows, "customer_card_extra_rate")));
        setActualCardRate(String(readNumber(rows, "actual_card_fee_rate")));
        setCardMinAmount(formatMoneyInput(readNumber(rows, "card_payment_min_amount")));
        setDefaultShippingFee(formatMoneyInput(readNumber(rows, "default_shipping_fee")));
        setRemoteShippingFee(formatMoneyInput(readNumber(rows, "remote_area_shipping_fee")));
        setVendorShippingFee(formatMoneyInput(readNumber(rows, "vendor_shipping_fee")));
        setVendorRemoteShippingFee(formatMoneyInput(readNumber(rows, "vendor_remote_area_shipping_fee")));
        setPointAutoEarn(clean(rows.find((r) => r.key === "point_auto_earn_enabled")?.value) === "true");
        setPointEarnRate(String(readNumber(rows, "point_earn_rate")));
        {
          const hold = decomposeHoldMinutes(readNumber(rows, "cart_hold_minutes"));
          setHoldAmount(hold.amount);
          setHoldUnit(hold.unit);
        }
        setDirectInputEnabled(clean(rows.find((r) => r.key === "direct_input_enabled")?.value || "true") !== "false");
        setHowtoEnabled(clean(rows.find((r) => r.key === "howto_enabled")?.value || "true") !== "false");
        setFinalSubmitConfirmationEnabled(parseFinalSubmitConfirmationEnabled(rows));
        {
          const cfg = parseHowtoSteps(rows.find((r) => r.key === "howto_steps")?.value);
          setHowtoSteps(cfg.steps);
          setHowtoWarn(cfg.warn);
        }
        setProductNoticeMode(parseProductNoticeMode(rows.find((r) => r.key === "product_notice_mode")?.value));
        setProductNoticeCustom(clean(rows.find((r) => r.key === "product_notice_custom")?.value || ""));
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSettings();

    return () => {
      alive = false;
    };
  }, []);

  const saveSettings = async ():Promise<boolean> => {
    const nextCustomerCardRate = Math.min(20, Math.max(0, toNumber(customerCardRate)));
    const nextActualCardRate = Math.min(20, Math.max(0, toNumber(actualCardRate)));
    const nextCardMinAmount = Math.max(0, Math.round(toNumber(cardMinAmount)));
    const nextDefaultShippingFee = Math.max(0, Math.round(toNumber(defaultShippingFee)));
    const nextRemoteShippingFee = Math.max(nextDefaultShippingFee, Math.round(toNumber(remoteShippingFee)));
    const nextVendorShippingFee = Math.max(0, Math.round(toNumber(vendorShippingFee)));
    const nextVendorRemoteShippingFee = Math.max(nextVendorShippingFee, Math.round(toNumber(vendorRemoteShippingFee)));
    const nextPointEarnRate = Math.min(100, Math.max(0, toNumber(pointEarnRate)));
    // 장바구니 선점 유지시간: 분으로 환산, 10분~30일(43200분) 클램프 — API 쪽 클램프와 동일 기준
    const nextHoldMinutes = Math.min(43200, Math.max(10, Math.round(toNumber(holdAmount) * HOLD_UNIT_MULT[holdUnit])));

    setSaving(true);

    try {
      const { error } = await supabase.from("settings").upsert(
        [
          { key: "customer_card_extra_rate", value: String(nextCustomerCardRate) },
          { key: "actual_card_fee_rate", value: String(nextActualCardRate) },
          { key: "card_payment_min_amount", value: String(nextCardMinAmount) },
          { key: "default_shipping_fee", value: String(nextDefaultShippingFee) },
          { key: "remote_area_shipping_fee", value: String(nextRemoteShippingFee) },
          { key: "vendor_shipping_fee", value: String(nextVendorShippingFee) },
          { key: "vendor_remote_area_shipping_fee", value: String(nextVendorRemoteShippingFee) },
          { key: "point_auto_earn_enabled", value: pointAutoEarn ? "true" : "false" },
          { key: "point_earn_rate", value: String(nextPointEarnRate) },
          { key: "cart_hold_minutes", value: String(nextHoldMinutes) },
          { key: "direct_input_enabled", value: directInputEnabled ? "true" : "false" },
          { key: "howto_enabled", value: howtoEnabled ? "true" : "false" },
          { key: "howto_steps", value: JSON.stringify({ steps: howtoSteps, warn: howtoWarn }) },
          toFinalSubmitConfirmationRow(finalSubmitConfirmationEnabled),
          { key: "product_notice_mode", value: productNoticeMode },
          { key: "product_notice_custom", value: productNoticeCustom.trim().slice(0, PRODUCT_NOTICE_MAX_LEN) },
        ],
        { onConflict: "key" },
      );

      if (error) {
        showAdminToast("설정 저장 실패\n\n" + error.message, "error");
        return false;
      }

      setCustomerCardRate(String(nextCustomerCardRate));
      setActualCardRate(String(nextActualCardRate));
      setCardMinAmount(formatMoneyInput(nextCardMinAmount));
      setDefaultShippingFee(formatMoneyInput(nextDefaultShippingFee));
      setRemoteShippingFee(formatMoneyInput(nextRemoteShippingFee));
      setVendorShippingFee(formatMoneyInput(nextVendorShippingFee));
      setVendorRemoteShippingFee(formatMoneyInput(nextVendorRemoteShippingFee));
      {
        const holdNorm = decomposeHoldMinutes(nextHoldMinutes);
        setHoldAmount(holdNorm.amount);
        setHoldUnit(holdNorm.unit);
      }

      showAdminToast("운영 설정을 저장했습니다.", "success");
      const holdNorm = decomposeHoldMinutes(nextHoldMinutes);
      markGlobalSaved({...globalDraft,customerCardRate:String(nextCustomerCardRate),actualCardRate:String(nextActualCardRate),cardMinAmount:formatMoneyInput(nextCardMinAmount),defaultShippingFee:formatMoneyInput(nextDefaultShippingFee),remoteShippingFee:formatMoneyInput(nextRemoteShippingFee),vendorShippingFee:formatMoneyInput(nextVendorShippingFee),vendorRemoteShippingFee:formatMoneyInput(nextVendorRemoteShippingFee),holdAmount:holdNorm.amount,holdUnit:holdNorm.unit});
      return true;
    } catch (error) {
      showAdminToast("설정 저장 실패\n\n"+(error instanceof Error ? error.message : String(error)),"error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const globalDraft={customerCardRate,actualCardRate,cardMinAmount,defaultShippingFee,remoteShippingFee,vendorShippingFee,vendorRemoteShippingFee,pointAutoEarn,pointEarnRate,holdAmount,holdUnit,directInputEnabled,howtoEnabled,howtoSteps,howtoWarn,finalSubmitConfirmationEnabled,productNoticeMode,productNoticeCustom};
  const markGlobalSaved=useSettingsDraft({value:globalDraft,loading,saving,save:saveSettings,onDraftStateChange:setGlobalDraftState,onDiscard:(value)=>{
    setCustomerCardRate(value.customerCardRate);setActualCardRate(value.actualCardRate);setCardMinAmount(value.cardMinAmount);setDefaultShippingFee(value.defaultShippingFee);setRemoteShippingFee(value.remoteShippingFee);setVendorShippingFee(value.vendorShippingFee);setVendorRemoteShippingFee(value.vendorRemoteShippingFee);setPointAutoEarn(value.pointAutoEarn);setPointEarnRate(value.pointEarnRate);setHoldAmount(value.holdAmount);setHoldUnit(value.holdUnit);setDirectInputEnabled(value.directInputEnabled);setHowtoEnabled(value.howtoEnabled);setHowtoSteps(value.howtoSteps);setHowtoWarn(value.howtoWarn);setFinalSubmitConfirmationEnabled(value.finalSubmitConfirmationEnabled);setProductNoticeMode(value.productNoticeMode);setProductNoticeCustom(value.productNoticeCustom);
  }});
  draftRef.current=GLOBAL_SAVE_TABS.includes(activeTab) ? globalDraftState : childDraft;
  const protectNavigation=useCallback(async()=>{
    const draft=draftRef.current;
    if (draft?.saving || pendingRef.current) return false;
    if (!draft?.dirty) return true;
    return new Promise<boolean>(resolve=>{pendingRef.current=resolve;setChoiceOpen(true);});
  },[]);
  useEffect(()=>{onNavigationGuardChange?.(protectNavigation);return()=>{onNavigationGuardChange?.(null);pendingRef.current?.(false);pendingRef.current=null;};},[onNavigationGuardChange,protectNavigation]);
  useEffect(()=>{
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(draftRef.current?.dirty){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",beforeUnload);return()=>window.removeEventListener("beforeunload",beforeUnload);
  },[]);
  const finishChoice=(ok:boolean)=>{const resolve=pendingRef.current;pendingRef.current=null;setChoiceOpen(false);resolve?.(ok);};
  const selectDestination=async(destination:SettingsDestination)=>{
    if ("tab" in destination && destination.tab===activeTab) {setFocusSection(destination.section);return;}
    if (!(await protectNavigation())) return;
    setChildDraft(null);setActiveTab(destination.tab);setFocusSection(destination.section);
  };
  const cardClass = "rounded-2xl border border-line bg-surface p-4";
  const sectionTitle = (title: string, desc?: string) => (
    <div className="mb-4">
      <h2 className="text-base font-black text-ink">{title}</h2>
      {desc ? <p className="mt-1 text-xs font-bold text-ink-mute">{desc}</p> : null}
    </div>
  );

  return (
    /* [2026-09-20 사장님 폰 화면 깨짐] 폰에서 왼쪽 메뉴(176px)가 자리를 다 먹어 오른쪽 내용이 «오/늘/의» 한 글자씩 세로로 쪼개졌다.
       → 폰에서는 위아래로 쌓고(메뉴는 가로 스크롤 칩 줄), 넓은 화면(md+)에서만 예전처럼 좌우 2단. 표시 전용 */
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* 좌측 카테고리 네비 (업계표준: 카테고리로 나눠 스크롤 최소화) */}
      <AdminLiveSettingsNavigation activeTab={activeTab} section={focusSection} onSelect={destination=>void selectDestination(destination)} />
      {choiceOpen ? <SettingsUnsavedChangesDialog saving={Boolean(draftRef.current?.saving)} onSave={()=>void(async()=>{try{if(await draftRef.current?.save()) {draftRef.current=null;finishChoice(true);}}catch(error){showAdminToast(error instanceof Error ? error.message : String(error),"error");}})()} onDiscard={()=>{draftRef.current?.discard();draftRef.current=null;finishChoice(true);}} onCancel={()=>{if(!draftRef.current?.saving) finishChoice(false);}} /> : null}

      {/* 우측 내용 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-3 md:p-5">
          {/* ── 상점 정보 (자체 저장: /api/admin-live/shop-info) ── */}
          {activeTab === "shop" && <ShopInfoSettingsTab onDraftStateChange={setChildDraft} focusSection={focusSection} />}

          {/* ── 상품사진 문구 (자체 저장: /api/admin-live/product-image-notice) ── */}
          {activeTab === "photo" && <ProductImageNoticeSettingsTab onDraftStateChange={setChildDraft} />}

          {/* ── 결제·배송 ── */}
          {activeTab === "payment" && (
            <>
              <div className="rounded-2xl border border-line bg-warn-bg px-4 py-3 text-xs font-bold leading-5 text-warn-tx">
                저장 후 새 주문부터 적용(기존 주문 재계산 없음)
              </div>

              <div className={cardClass}>
                {sectionTitle("카드결제")}
                <div className="grid gap-3">
                  <SettingInput
                    label="고객 카드 부가세율"
                    desc="손님 주문금액에 더해지는 비율"
                    value={customerCardRate}
                    suffix="%"
                    onChange={(value) => setCustomerCardRate(onlyDigits(value))}
                  />
                  <SettingInput
                    label="실제 카드업체 수수료율"
                    desc="정산에서 지출로 잡는 비율"
                    value={actualCardRate}
                    suffix="%"
                    onChange={(value) => setActualCardRate(onlyDigits(value))}
                  />
                  <SettingInput
                    label="카드결제 최소금액"
                    desc="이 금액 미만은 카드결제 불가"
                    value={cardMinAmount}
                    suffix="원"
                    onChange={(value) => setCardMinAmount(formatMoneyInput(value))}
                  />
                </div>
              </div>

              <div className={cardClass}>
                {sectionTitle("배송비")}
                <div className="grid gap-3">
                  <SettingInput
                    label="기본 배송비"
                    value={defaultShippingFee}
                    suffix="원"
                    onChange={(value) => setDefaultShippingFee(formatMoneyInput(value))}
                  />
                  <SettingInput
                    label="제주/산간 배송비"
                    desc="기본 배송비보다 낮게 저장 안 됨"
                    value={remoteShippingFee}
                    suffix="원"
                    onChange={(value) => setRemoteShippingFee(formatMoneyInput(value))}
                  />
                  <SettingInput
                    label="업체배송비"
                    desc="업체1·업체2 상품에 업체마다 따로 붙음 · 기본 배송비를 0원으로 해도 그대로"
                    value={vendorShippingFee}
                    suffix="원"
                    onChange={(value) => setVendorShippingFee(formatMoneyInput(value))}
                  />
                  <SettingInput
                    label="업체배송 제주/산간"
                    desc="업체배송비보다 낮게 저장 안 됨"
                    value={vendorRemoteShippingFee}
                    suffix="원"
                    onChange={(value) => setVendorRemoteShippingFee(formatMoneyInput(value))}
                  />
                </div>
              </div>
            </>
          )}

          {/* ── 포인트 적립 ── */}
          {activeTab === "point" && (
            <div className={cardClass}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-ink">포인트 적립 규칙</h2>
                  <p className="mt-1 text-xs font-bold text-ink-mute">결제완료 시 상품금액(배송비 제외)의 비율만큼 적립</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPointAutoEarn((v) => !v)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${pointAutoEarn ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
                >
                  {pointAutoEarn ? "자동적립 ON" : "자동적립 OFF"}
                </button>
              </div>

              <div className={pointAutoEarn ? "" : "pointer-events-none opacity-50"}>
                <SettingInput
                  label="적립률"
                  desc="예) 1.5 → 1만원에 150P"
                  value={pointEarnRate}
                  suffix="%"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  onChange={(value) => setPointEarnRate(decimalInput(value))}
                />
              </div>

              <div className="mt-3 rounded-2xl border border-line bg-warn-bg px-4 py-3 text-[11px] font-bold leading-5 text-warn-tx">
                결제완료 시 자동 지급되며, 자동적립은 알림 팝업이 뜨지 않습니다(주문서 안내 문구로만 표시). 실제 지급/차감 관리는 포인트 메뉴에서.
              </div>
            </div>
          )}

          {/* ── 주문서 표시 ── */}
          {activeTab === "order" && (
            <div className={cardClass}>
              {sectionTitle("주문서 표시")}

              {/* [2026-07-13 사장님 지침] 장바구니 선점 유지시간 — 담는 순간 다른 고객 화면 남은 수량에서
                  빠져 보이는 시간. 지나면 자동 해제(표시용 예약만 — 진짜 재고/주문/차감 로직 무관). */}
              <div className="mb-3 rounded-xl border border-line bg-surface-2 p-4">
                <div className="text-sm font-black text-ink">장바구니 선점 유지시간</div>
                <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
                  고객이 장바구니에 담으면 이 시간 동안 다른 고객에게 남은 수량에서 빠져 보입니다. 시간이 지나면 자동
                  해제됩니다. 실제 재고 차감은 기존대로 주문서 제출 때만 일어납니다. (최소 10분 ~ 최대 30일)
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={holdAmount}
                    onChange={(e) => setHoldAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    className="w-24 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-black text-ink outline-none transition focus:border-rose-deep"
                  />
                  <select
                    value={holdUnit}
                    onChange={(e) => setHoldUnit(e.target.value as HoldUnit)}
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-black text-ink outline-none transition focus:border-rose-deep"
                  >
                    <option value="minute">분</option>
                    <option value="hour">시간</option>
                    <option value="day">일</option>
                  </select>
                  <span className="text-xs font-bold text-ink-mute">동안 장바구니 유지</span>
                </div>
              </div>

              {/* [2026-07-10] 주문 방법 팝업 — 접속하자마자 뜨는 안내. 켜고/끄기 + 내용 수정 */}
              <div className="mb-3 rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-ink">주문 방법 팝업</div>
                    <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
                      손님이 주문서에 접속하면 바로 뜹니다. 끄면 아예 안 뜹니다.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHowtoEnabled((v) => !v)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${
                      howtoEnabled ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-mute"
                    }`}
                  >
                    {howtoEnabled ? "켜짐" : "꺼짐"}
                  </button>
                </div>

                {howtoEnabled ? (
                  <div className="mt-3 space-y-3">
                    {howtoSteps.map((step, i) => (
                      <div key={i} className="rounded-2xl border border-line bg-surface p-3">
                        <div className="text-xs font-black text-rose-deep">{i + 1}단계</div>
                        <input
                          value={step.title}
                          onChange={(e) => {
                            const next = [...howtoSteps];
                            next[i] = { ...next[i], title: e.target.value };
                            setHowtoSteps(next);
                          }}
                          placeholder="제목"
                          className="mt-2 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-rose-deep"
                        />
                        <input
                          value={step.desc}
                          onChange={(e) => {
                            const next = [...howtoSteps];
                            next[i] = { ...next[i], desc: e.target.value };
                            setHowtoSteps(next);
                          }}
                          placeholder="설명 (비우면 안 보임)"
                          className="mt-2 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-bold text-ink-soft outline-none transition focus:border-rose-deep"
                        />
                      </div>
                    ))}
                    <div className="rounded-2xl border border-line bg-surface p-3">
                      <div className="text-xs font-black text-danger-tx">빨간 경고 문구 (3단계 아래)</div>
                      <textarea
                        value={howtoWarn}
                        onChange={(e) => setHowtoWarn(e.target.value)}
                        rows={2}
                        placeholder="비우면 경고 문구가 안 보입니다."
                        className="mt-2 w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-bold text-ink outline-none transition focus:border-rose-deep"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── [2026-09-22 사장님] 상품 주문 안내 문구 ──────────────────────────
                    「주문서표시 메뉴에다가 밑에 문구 설정가능하게 / 문구는 너의 추천을 따를게」

                    자리: 손님 상품창의 «수량·선택금액 줄 바로 위»(항상 보이는 아래 칸).
                      옵션 밑이 아니라 여기에 둔 이유 — 옵션은 스크롤하면 지나가지만,
                      «살 수 있는 조건»은 담기 버튼 옆에 있어야 누르기 «전에» 읽힌다(스마트스토어·쿠팡도 같은 자리).
                    색: 빨강+* 은 이 화면에서 «품절·선택 안 함» 경고에 쓰고 있어서, 같은 빨강이면 손님이
                      «오류»로 오해한다. 그래서 안내 톤(연한 살구 바탕 + 진한 갈색)으로 구분했다.
                    ⚠ 표시 전용 — 주문을 «막지» 않는다. 재고·진열·주문 로직과 무관. */}
              {/* [51] 바로구매는 상품 등록 화면 버튼 하나로 — 전체 기본값 칸 숨김(값은 live_only 그대로 저장·유지) */}
              <div className="hidden mb-3 rounded-xl border border-line bg-surface-2 p-4">
                <div className="text-sm font-black text-ink">상품 주문 안내 문구(기본값)</div>
                <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">상품마다 따로 정한 문구가 우선</div>

                <div className="mt-3 space-y-2">
                  {PRODUCT_NOTICE_PRESETS.map((preset) => {
                    const on = productNoticeMode === preset.mode;
                    return (
                      <button
                        key={preset.mode}
                        type="button"
                        onClick={() => setProductNoticeMode(preset.mode)}
                        className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                          on ? "border-rose-deep bg-rose-soft" : "border-line bg-surface"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            on ? "border-rose-deep" : "border-line"
                          }`}
                        >
                          {on ? <span className="h-2.5 w-2.5 rounded-full bg-rose-deep" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-xs font-black ${on ? "text-rose-deep" : "text-ink-soft"}`}>{preset.label}</span>
                          {preset.text ? (
                            <span className="mt-1 block text-sm font-bold leading-6 text-ink">{preset.text}</span>
                          ) : preset.mode === "custom" ? (
                            <span className="mt-1 block text-xs font-bold text-ink-mute">직접 쓴 문구를 보여줍니다.</span>
                          ) : (
                            <span className="mt-1 block text-xs font-bold text-ink-mute">아무 문구도 안 보입니다.</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {productNoticeMode === "custom" ? (
                  <div className="mt-3 rounded-2xl border border-line bg-surface p-3">
                    <div className="text-xs font-black text-ink-soft">직접 입력 ({PRODUCT_NOTICE_MAX_LEN}자까지)</div>
                    <textarea
                      value={productNoticeCustom}
                      onChange={(e) => setProductNoticeCustom(e.target.value.slice(0, PRODUCT_NOTICE_MAX_LEN))}
                      rows={2}
                      placeholder="예) 방송 중에만 주문받는 상품이에요"
                      className="mt-2 w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-rose-deep"
                    />
                    <div className="mt-1 text-[11px] font-bold text-ink-mute">{productNoticeCustom.trim().length} / {PRODUCT_NOTICE_MAX_LEN}자</div>
                  </div>
                ) : null}

                {/* 손님 화면에 그대로 보일 모습 — 저장 전에 눈으로 확인 */}
                {resolveProductOrderNotice(productNoticeMode, productNoticeCustom) ? (
                  <div className="mt-3">
                    <div className="mb-1 text-[11px] font-black text-ink-mute">손님 화면 미리보기</div>
                    {/* [2026-09-22 3차] 손님 화면과 «같은 모양»으로 — 가운데점(·) 기준 두 줄 */}
                    {(() => {
                      const { head, sub } = splitProductOrderNotice(resolveProductOrderNotice(productNoticeMode, productNoticeCustom));
                      return (
                        <div className="rounded-xl border border-warn-tx/30 bg-warn-bg px-3 py-2.5" style={{ wordBreak: "keep-all" }}>
                          <div className="text-sm font-bold leading-6 text-warn-tx">{head}</div>
                          {sub ? <div className="text-xs font-bold leading-5 text-warn-tx">{sub}</div> : null}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>

              {/* [2026-08-30] 공지 문구·접속 팝업 공지는 사이드바 「공지·쪽지」 메뉴로 옮겼다. */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
                {onOpenNotice ? (
                  <button
                    type="button"
                    onClick={() => void selectDestination({ tab: "notices" })}
                    className="shrink-0 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink transition hover:bg-surface-2"
                  >
                    공지사항 열기
                  </button>
                ) : null}
              </div>

              <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
                <div>
                  <div className="text-sm font-black text-ink">주문 전 최종 확인 체크</div>
                  <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
                    고객 주문서 맨 아래의 「배송지·상품·옵션·수량을 확인했습니다」 체크칸입니다. OFF면 체크칸이 숨겨지고 체크 없이 제출할 수 있습니다.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFinalSubmitConfirmationEnabled((value) => !value)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${finalSubmitConfirmationEnabled ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
                >
                  {finalSubmitConfirmationEnabled ? "최종 확인 ON" : "최종 확인 OFF"}
                </button>
              </div>

              <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
                <div>
                  <div className="text-sm font-black text-ink">직접 입력하기 버튼</div>
                  <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">손님이 상품을 직접 적어 주문하는 버튼</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDirectInputEnabled((v) => !v)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${directInputEnabled ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
                >
                  {directInputEnabled ? "직접입력 ON" : "직접입력 OFF"}
                </button>
              </div>

            </div>
          )}

          {/* ── 유튜브 알림 (자체 저장) ── */}
          {activeTab === "combine" && <CombineShippingSettingsTab onDraftStateChange={setChildDraft} />}

          {/* ── 방송 화면 (저장 없음: 프리즘 소스 주소·크기 안내) ── */}
          {activeTab === "screen" && <BroadcastScreenSettingsTab onOpenEvent={onOpenEvent} />}

          {/* ── 알림음 (이 브라우저에만 저장: localStorage) ── */}
          {activeTab === "sound" && (
            <div className={cardClass}>
              {sectionTitle("알림음", "이 컴퓨터에만 적용")}
              <AdminSoundControl />
            </div>
          )}

          {activeTab === "youtube" && <YoutubeNotifyCard onDraftStateChange={setChildDraft} />}

          {activeTab === "telegram" && <TelegramNotifyCard onDraftStateChange={setChildDraft} />}

          {/* [2026-10-21 a1-2] 손님 공지·구매동의 — 공지 패널을 설정 모드로(자체 「공지 저장」 사용, 공통 저장줄 없음) */}
          {activeTab === "notice" && <AdminLiveNoticePanel mode="settings" />}
          {/* [2026-10-21 사장님] 고객 › 쪽지·공지사항 → 설정 › 공지사항 / 쪽지 로 옮김 */}
          {activeTab === "notices" && <AdminLiveNoticePanel mode="board" />}
          {activeTab === "notes" && <AdminLiveNoticePanel mode="notes" />}


          {/* ── 관리자 보안 (읽기 전용) ── */}
          {activeTab === "security" && <AdminAuthSettingsPanel />}
        </div>

        {/* 하단 고정 저장바 — 운영값(결제·배송/포인트/주문서) 탭에서만. 유튜브/보안은 자체 저장 */}
        {GLOBAL_SAVE_TABS.includes(activeTab) && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3">
            <span className="text-xs font-bold text-ink-mute">{loading ? "불러오는 중..." : "저장 후 새 주문부터 반영됩니다."}</span>
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving || loading}
              className="ru-btn ru-btn-primary ru-btn-lg"
            >
              {saving ? "저장중..." : "설정 저장"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
