"use client";

import { useEffect, useMemo, useState } from "react";
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
  | "point_earn_rate";

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
];

const DEFAULTS: Record<SettingKey, number> = {
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

function readNumber(rows: SettingRow[], key: SettingKey) {
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
}: {
  label: string;
  desc: string;
  value: string;
  suffix: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-black text-slate-900">{label}</div>
      <div className="mt-1 text-xs font-bold leading-5 text-slate-400">{desc}</div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-black outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        />
        <span className="text-sm font-black text-slate-500">{suffix}</span>
      </div>
    </div>
  );
}

export default function AdminLiveSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customerCardRate, setCustomerCardRate] = useState(String(DEFAULTS.customer_card_extra_rate));
  const [actualCardRate, setActualCardRate] = useState(String(DEFAULTS.actual_card_fee_rate));
  const [cardMinAmount, setCardMinAmount] = useState(formatMoneyInput(DEFAULTS.card_payment_min_amount));
  const [defaultShippingFee, setDefaultShippingFee] = useState(formatMoneyInput(DEFAULTS.default_shipping_fee));
  const [remoteShippingFee, setRemoteShippingFee] = useState(formatMoneyInput(DEFAULTS.remote_area_shipping_fee));
  const [pointAutoEarn, setPointAutoEarn] = useState(false);
  const [pointEarnRate, setPointEarnRate] = useState(String(DEFAULTS.point_earn_rate));

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
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSettings();

    return () => {
      alive = false;
    };
  }, []);

  const preview = useMemo(() => {
    return {
      customerCardRate: toNumber(customerCardRate),
      actualCardRate: toNumber(actualCardRate),
      cardMinAmount: toNumber(cardMinAmount),
      defaultShippingFee: toNumber(defaultShippingFee),
      remoteShippingFee: toNumber(remoteShippingFee),
    };
  }, [customerCardRate, actualCardRate, cardMinAmount, defaultShippingFee, remoteShippingFee]);

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

  return (
    <section className="grid gap-5">
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black tracking-[0.22em] text-rose-deep">ADMIN LIVE SETTINGS</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">설정</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              주문서·카드결제·배송비에 실제 적용되는 운영 설정입니다. 저장 후 새 주문부터 반영됩니다.
            </p>
          </div>

          <button
            type="button"
            onClick={saveSettings}
            disabled={saving || loading}
            className="rounded-2xl bg-rose-deep px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-rose-deep disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? "저장중" : "설정 저장"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-xs font-bold leading-5 text-orange-800">
          설정은 주문금액·카드결제·배송비에 영향을 줍니다. 기존 주문을 재계산하지 않고, 저장 이후 새 주문부터 적용되는 기준값입니다.
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-950">카드결제 설정</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">카드결제 최소금액과 수수료율을 관리합니다.</p>
          </div>

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

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-950">배송비 설정</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">주문서 배송비 계산에 적용되는 기준입니다.</p>
          </div>

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
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">포인트 적립 규칙</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">결제완료(자동·수동 입금확인, 카드결제완료) 시 구매금액(택배비 제외)의 일정 비율을 자동 적립합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => setPointAutoEarn((v) => !v)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${pointAutoEarn ? "bg-rose-deep text-white" : "border border-slate-200 bg-white text-slate-500"}`}
          >
            {pointAutoEarn ? "자동적립 ON" : "자동적립 OFF"}
          </button>
        </div>

        <div className={pointAutoEarn ? "" : "pointer-events-none opacity-50"}>
          <SettingInput
            label="적립률"
            desc="상품금액(택배비 제외) 대비 적립 비율입니다. 예: 3% → 1만원 구매 시 300P 적립."
            value={pointEarnRate}
            suffix="%"
            onChange={(value) => setPointEarnRate(onlyDigits(value))}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-[11px] font-bold leading-5 text-orange-800">
          결제완료 시 자동 지급되며, 자동적립은 알림 팝업이 뜨지 않습니다(주문서 안내 문구로만 표시). 실제 지급/차감 관리는 포인트 메뉴에서.
        </div>
      </div>

      <div className="rounded-[30px] border border-rose-line bg-rose-soft p-5">
        <h2 className="text-lg font-black text-slate-950">현재 설정 미리보기</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl bg-white p-4">
            <div className="text-xs font-black text-slate-400">고객 카드 부가세율</div>
            <div className="mt-1 text-xl font-black text-slate-950">{preview.customerCardRate}%</div>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <div className="text-xs font-black text-slate-400">실제 카드수수료율</div>
            <div className="mt-1 text-xl font-black text-slate-950">{preview.actualCardRate}%</div>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <div className="text-xs font-black text-slate-400">카드결제 최소금액</div>
            <div className="mt-1 text-xl font-black text-slate-950">{preview.cardMinAmount.toLocaleString()}원</div>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <div className="text-xs font-black text-slate-400">기본 배송비</div>
            <div className="mt-1 text-xl font-black text-slate-950">{preview.defaultShippingFee.toLocaleString()}원</div>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <div className="text-xs font-black text-slate-400">제주/산간 배송비</div>
            <div className="mt-1 text-xl font-black text-slate-950">{preview.remoteShippingFee.toLocaleString()}원</div>
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white px-5 py-4 text-sm font-bold leading-6 text-slate-500">
        합배송 시간 설정, 주문서 작성 가능 시간, 알림 설정은 다음 설정 단계에서 분리해서 추가합니다.
      </div>
    <AdminAuthSettingsPanel />

    </section>
  );
}
