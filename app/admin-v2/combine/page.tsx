// app/admin-v2/combine/page.tsx
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/app/admin-v2/combine/page.tsx
// 목적: 임시 합배송 시간 설정 페이지
// 주의: AdminV2Client.tsx 관리자 본체는 건드리지 않습니다.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  COMBINE_SHIPPING_SETTING_KEYS,
  fromDateTimeLocalValue,
  getDefaultTonightCombineWindow,
  parseCombineShippingSettings,
  toDateTimeLocalValue,
} from "@/lib/admin-v2/combineShipping";

const SETTING_LABELS = {
  enabled: "합배송 사용",
  startAt: "합배송 시작",
  endAt: "합배송 마감",
};

export default function CombineShippingAdminPage() {
  const [enabled, setEnabled] = useState(false);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", COMBINE_SHIPPING_SETTING_KEYS);

    if (error) {
      alert("합배송 설정 불러오기 오류: " + error.message);
      setLoading(false);
      return;
    }

    const settings = parseCombineShippingSettings(data);

    setEnabled(settings.enabled);
    setStartLocal(toDateTimeLocalValue(settings.startAt));
    setEndLocal(toDateTimeLocalValue(settings.endAt));
    setLoading(false);
  };

  const saveSettings = async () => {
    if (!startLocal) {
      alert(`${SETTING_LABELS.startAt} 시간을 입력해주세요.`);
      return;
    }

    if (!endLocal) {
      alert(`${SETTING_LABELS.endAt} 시간을 입력해주세요.`);
      return;
    }

    const startIso = fromDateTimeLocalValue(startLocal);
    const endIso = fromDateTimeLocalValue(endLocal);

    if (!startIso || !endIso) {
      alert("합배송 시간을 다시 확인해주세요.");
      return;
    }

    if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      alert("합배송 마감시간은 시작시간보다 늦어야 합니다.");
      return;
    }

    setSaving(true);

    const rows = [
      {
        key: "combine_shipping_enabled",
        value: enabled ? "true" : "false",
      },
      {
        key: "combine_shipping_start_at",
        value: startIso,
      },
      {
        key: "combine_shipping_end_at",
        value: endIso,
      },
    ];

    const { error } = await supabase
      .from("settings")
      .upsert(rows, { onConflict: "key" });

    setSaving(false);

    if (error) {
      alert("저장 오류: " + error.message);
      return;
    }

    alert("합배송 설정을 저장했습니다.");
  };

  const applyTonightDefault = () => {
    const tonight = getDefaultTonightCombineWindow();

    setEnabled(true);
    setStartLocal(tonight.startLocal);
    setEndLocal(tonight.endLocal);
  };

  const forceEndNow = async () => {
    if (!confirm("지금 합배송을 강제 종료할까요?\n이후 새 주문은 배송비가 다시 붙습니다.")) {
      return;
    }

    const nowLocal = toDateTimeLocalValue(new Date().toISOString());

    setEnabled(false);
    setEndLocal(nowLocal);

    setSaving(true);

    const rows = [
      {
        key: "combine_shipping_enabled",
        value: "false",
      },
      {
        key: "combine_shipping_end_at",
        value: new Date().toISOString(),
      },
    ];

    const { error } = await supabase
      .from("settings")
      .upsert(rows, { onConflict: "key" });

    setSaving(false);

    if (error) {
      alert("강제종료 오류: " + error.message);
      return;
    }

    alert("합배송을 강제 종료했습니다.");
  };

  return (
    <main className="min-h-screen bg-[#f8f1e8] px-4 py-6 text-[#241b17]">
      <section className="mx-auto w-full max-w-md">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-[#f05a45]">ADMIN</div>
            <h1 className="mt-1 text-[32px] font-black tracking-[-0.07em]">
              합배송 시간 설정
            </h1>
          </div>

          <Link
            href="/admin-v2"
            className="rounded-2xl bg-white px-4 py-3 text-sm font-black shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
          >
            관리자 홈
          </Link>
        </div>

        <section className="rounded-[30px] bg-white p-5 shadow-[0_12px_26px_rgba(70,45,25,0.10)] ring-1 ring-black/5">
          {loading ? (
            <div className="py-12 text-center text-sm font-black text-[#7b6554]">
              설정 불러오는 중...
            </div>
          ) : (
            <div className="grid gap-4">
              <label className="flex items-center justify-between rounded-2xl bg-[#fff7ec] p-4">
                <div>
                  <div className="text-lg font-black">{SETTING_LABELS.enabled}</div>
                  <div className="mt-1 text-xs font-bold text-[#7b6554]">
                    ON이면 설정 시간 안에서 배송비 중복을 막습니다.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  className="h-6 w-6"
                />
              </label>

              <div>
                <label className="text-sm font-black text-[#5f4a3c]">
                  {SETTING_LABELS.startAt}
                </label>
                <input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(event) => setStartLocal(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#ead8c8] bg-white p-4 font-black outline-none focus:border-[#f05a45]"
                />
              </div>

              <div>
                <label className="text-sm font-black text-[#5f4a3c]">
                  {SETTING_LABELS.endAt}
                </label>
                <input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(event) => setEndLocal(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#ead8c8] bg-white p-4 font-black outline-none focus:border-[#f05a45]"
                />
              </div>

              <button
                type="button"
                onClick={applyTonightDefault}
                className="rounded-2xl bg-[#fff7ec] p-4 font-black text-[#8a5a36] active:scale-[0.98]"
              >
                오늘 19:00 ~ 내일 04:00 자동 입력
              </button>

              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                className="rounded-2xl bg-[#f05a45] p-4 font-black text-white shadow-lg shadow-orange-100 active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? "저장 중..." : "합배송 설정 저장"}
              </button>

              <button
                type="button"
                onClick={forceEndNow}
                disabled={saving}
                className="rounded-2xl bg-gray-950 p-4 font-black text-white active:scale-[0.98] disabled:opacity-60"
              >
                합배송 강제종료
              </button>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[24px] bg-white/80 p-4 text-sm font-bold leading-relaxed text-[#6b5b50] shadow-[0_8px_18px_rgba(70,45,25,0.06)] ring-1 ring-black/5">
          <div className="font-black text-[#241b17]">운영 기준</div>
          <div className="mt-2">
            저장 후 새로 들어오는 주문부터 적용됩니다.
            기존 주문 금액은 재계산하지 않습니다.
            강제종료 이후 주문은 배송비가 다시 붙습니다.
          </div>
        </section>
      </section>
    </main>
  );
}
