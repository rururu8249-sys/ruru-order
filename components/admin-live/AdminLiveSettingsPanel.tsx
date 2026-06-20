"use client";

import { useEffect, useState } from "react";
import YoutubeNotifyCard from "./YoutubeNotifyCard";
import TelegramNotifyCard from "./TelegramNotifyCard";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import AdminAuthSettingsPanel from "./AdminAuthSettingsPanel";

type SettingKey =
  | "customer_card_extra_rate"
  | "actual_card_fee_rate"
  | "card_payment_min_amount"
  | "default_shipping_fee"
  | "remote_area_shipping_fee"
  | "point_auto_earn_enabled"
  | "point_earn_rate"
  | "notice_text"
  | "direct_input_enabled";

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
  "point_auto_earn_enabled",
  "point_earn_rate",
  "notice_text",
  "direct_input_enabled",
];

type NumericSettingKey = Exclude<SettingKey, "notice_text" | "direct_input_enabled">;

const DEFAULTS: Record<NumericSettingKey, number> = {
  customer_card_extra_rate: 10,
  actual_card_fee_rate: 7,
  card_payment_min_amount: 100000,
  default_shipping_fee: 4000,
  remote_area_shipping_fee: 6000,
  point_auto_earn_enabled: 0,
  point_earn_rate: 0,
};

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
  desc: string;
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
    <div className="rounded-[24px] border border-line bg-surface-2 p-4">
      <div className="text-sm font-black text-ink">{label}</div>
      <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">{desc}</div>
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
type SettingsTab = "payment" | "point" | "order" | "youtube" | "telegram" | "security";
const SETTINGS_TABS: { key: SettingsTab; label: string; icon: string; desc: string }[] = [
  { key: "payment", label: "결제·배송", icon: "💳", desc: "카드 수수료·배송비" },
  { key: "point", label: "포인트 적립", icon: "🪙", desc: "자동적립·적립률" },
  { key: "order", label: "주문서 표시", icon: "📝", desc: "공지·직접입력" },
  { key: "youtube", label: "유튜브 알림", icon: "📺", desc: "라이브 채팅 자동알림" },
  { key: "telegram", label: "텔레그램 알림", icon: "📨", desc: "폰 푸시 알림" },
  { key: "security", label: "관리자 보안", icon: "🔒", desc: "로그인 정보" },
];
// 하단 공통 저장바(운영값)를 쓰는 탭 — 유튜브/보안은 자체 저장
const GLOBAL_SAVE_TABS: SettingsTab[] = ["payment", "point", "order"];

export default function AdminLiveSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("payment");

  const [customerCardRate, setCustomerCardRate] = useState(String(DEFAULTS.customer_card_extra_rate));
  const [actualCardRate, setActualCardRate] = useState(String(DEFAULTS.actual_card_fee_rate));
  const [cardMinAmount, setCardMinAmount] = useState(formatMoneyInput(DEFAULTS.card_payment_min_amount));
  const [defaultShippingFee, setDefaultShippingFee] = useState(formatMoneyInput(DEFAULTS.default_shipping_fee));
  const [remoteShippingFee, setRemoteShippingFee] = useState(formatMoneyInput(DEFAULTS.remote_area_shipping_fee));
  const [pointAutoEarn, setPointAutoEarn] = useState(false);
  const [pointEarnRate, setPointEarnRate] = useState(String(DEFAULTS.point_earn_rate));
  const [noticeText, setNoticeText] = useState("");
  const [directInputEnabled, setDirectInputEnabled] = useState(true);

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
        setPointAutoEarn(clean(rows.find((r) => r.key === "point_auto_earn_enabled")?.value) === "true");
        setPointEarnRate(String(readNumber(rows, "point_earn_rate")));
        setNoticeText(String(rows.find((r) => r.key === "notice_text")?.value ?? ""));
        setDirectInputEnabled(clean(rows.find((r) => r.key === "direct_input_enabled")?.value || "true") !== "false");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSettings();

    return () => {
      alive = false;
    };
  }, []);

  const saveSettings = async () => {
    const nextCustomerCardRate = Math.min(20, Math.max(0, toNumber(customerCardRate)));
    const nextActualCardRate = Math.min(20, Math.max(0, toNumber(actualCardRate)));
    const nextCardMinAmount = Math.max(0, Math.round(toNumber(cardMinAmount)));
    const nextDefaultShippingFee = Math.max(0, Math.round(toNumber(defaultShippingFee)));
    const nextRemoteShippingFee = Math.max(nextDefaultShippingFee, Math.round(toNumber(remoteShippingFee)));
    const nextPointEarnRate = Math.min(100, Math.max(0, toNumber(pointEarnRate)));

    setSaving(true);

    try {
      const { error } = await supabase.from("settings").upsert(
        [
          { key: "customer_card_extra_rate", value: String(nextCustomerCardRate) },
          { key: "actual_card_fee_rate", value: String(nextActualCardRate) },
          { key: "card_payment_min_amount", value: String(nextCardMinAmount) },
          { key: "default_shipping_fee", value: String(nextDefaultShippingFee) },
          { key: "remote_area_shipping_fee", value: String(nextRemoteShippingFee) },
          { key: "point_auto_earn_enabled", value: pointAutoEarn ? "true" : "false" },
          { key: "point_earn_rate", value: String(nextPointEarnRate) },
          { key: "notice_text", value: noticeText },
          { key: "direct_input_enabled", value: directInputEnabled ? "true" : "false" },
        ],
        { onConflict: "key" },
      );

      if (error) {
        showAdminToast("설정 저장 실패\n\n" + error.message, "error");
        return;
      }

      setCustomerCardRate(String(nextCustomerCardRate));
      setActualCardRate(String(nextActualCardRate));
      setCardMinAmount(formatMoneyInput(nextCardMinAmount));
      setDefaultShippingFee(formatMoneyInput(nextDefaultShippingFee));
      setRemoteShippingFee(formatMoneyInput(nextRemoteShippingFee));

      showAdminToast("운영 설정을 저장했습니다.", "success");
    } finally {
      setSaving(false);
    }
  };

  const cardClass = "rounded-2xl border border-line bg-surface p-5";
  const sectionTitle = (title: string, desc: string) => (
    <div className="mb-4">
      <h2 className="text-base font-black text-ink">{title}</h2>
      <p className="mt-1 text-xs font-bold text-ink-mute">{desc}</p>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* 좌측 카테고리 네비 (업계표준: 카테고리로 나눠 스크롤 최소화) */}
      <nav className="w-44 shrink-0 space-y-1 overflow-y-auto border-r border-line bg-surface-2/60 p-3">
        {SETTINGS_TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-rose-deep text-white" : "text-ink-soft hover:bg-surface"}`}
            >
              <span className="text-sm font-black">{t.icon} {t.label}</span>
              <span className={`mt-0.5 text-[11px] font-bold ${active ? "text-white/70" : "text-ink-mute"}`}>{t.desc}</span>
            </button>
          );
        })}
      </nav>

      {/* 우측 내용 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* ── 결제·배송 ── */}
          {activeTab === "payment" && (
            <>
              <div className="rounded-2xl border border-line bg-warn-bg px-4 py-3 text-xs font-bold leading-5 text-warn-tx">
                결제·배송 설정은 주문금액 계산에 직접 영향을 줍니다. 저장 이후 새 주문부터 적용됩니다(기존 주문 재계산 없음).
              </div>

              <div className={cardClass}>
                {sectionTitle("카드결제", "카드결제 최소금액과 수수료율을 관리합니다.")}
                <div className="grid gap-3">
                  <SettingInput
                    label="고객 카드 부가세율"
                    desc="고객이 카드결제를 선택할 때 주문금액에 추가되는 비율입니다."
                    value={customerCardRate}
                    suffix="%"
                    onChange={(value) => setCustomerCardRate(onlyDigits(value))}
                  />
                  <SettingInput
                    label="실제 카드업체 수수료율"
                    desc="정산통계에서 카드수수료 지출로 계산되는 비율입니다."
                    value={actualCardRate}
                    suffix="%"
                    onChange={(value) => setActualCardRate(onlyDigits(value))}
                  />
                  <SettingInput
                    label="카드결제 최소금액"
                    desc="고객 주문서에서 카드결제를 선택할 수 있는 최소 주문금액입니다."
                    value={cardMinAmount}
                    suffix="원"
                    onChange={(value) => setCardMinAmount(formatMoneyInput(value))}
                  />
                </div>
              </div>

              <div className={cardClass}>
                {sectionTitle("배송비", "주문서 배송비 계산에 적용되는 기준입니다.")}
                <div className="grid gap-3">
                  <SettingInput
                    label="기본 배송비"
                    desc="일반 지역 주문서에 적용되는 기본 배송비입니다."
                    value={defaultShippingFee}
                    suffix="원"
                    onChange={(value) => setDefaultShippingFee(formatMoneyInput(value))}
                  />
                  <SettingInput
                    label="제주/산간 배송비"
                    desc="제주/산간 주소로 감지될 때 적용되는 배송비입니다. 기본 배송비보다 낮게 저장되지 않습니다."
                    value={remoteShippingFee}
                    suffix="원"
                    onChange={(value) => setRemoteShippingFee(formatMoneyInput(value))}
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
                  <p className="mt-1 text-xs font-bold text-ink-mute">결제완료(자동·수동 입금확인, 카드결제완료) 시 구매금액(택배비 제외)의 일정 비율을 자동 적립합니다.</p>
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
                  desc="상품금액(택배비 제외) 대비 적립 비율입니다. 소수점 가능. 예: 1.5% → 1만원 구매 시 150P 적립."
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
              {sectionTitle("주문서 공지 / 직접입력", "손님 주문서 상단 공지 문구와 “직접 입력하기” 버튼 노출 여부를 관리합니다.")}

              <div className="rounded-[20px] border border-line bg-surface-2 p-4">
                <div className="text-sm font-black text-ink">주문서 공지 문구</div>
                <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">비워두면 공지 배너가 표시되지 않습니다. 줄바꿈 가능.</div>
                <textarea
                  value={noticeText}
                  onChange={(event) => setNoticeText(event.target.value)}
                  placeholder="예) 오늘 방송은 21시 시작합니다. 입금자명은 닉네임과 동일하게 부탁드려요."
                  rows={3}
                  className="mt-3 w-full resize-none rounded-2xl border border-line bg-surface p-4 text-sm font-bold leading-relaxed outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft"
                />
              </div>

              <div className="mt-3 flex items-start justify-between gap-3 rounded-[20px] border border-line bg-surface-2 p-4">
                <div>
                  <div className="text-sm font-black text-ink">직접 입력하기 버튼</div>
                  <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">상품 목록에서 못 찾은 상품을 손님이 직접 입력하는 버튼입니다. OFF 시 버튼이 숨겨집니다.</div>
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
          {activeTab === "youtube" && <YoutubeNotifyCard />}

          {activeTab === "telegram" && <TelegramNotifyCard />}

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
              className="rounded-2xl bg-rose-deep px-6 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-rose-deep disabled:cursor-wait disabled:opacity-50"
            >
              {saving ? "저장중..." : "설정 저장"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
