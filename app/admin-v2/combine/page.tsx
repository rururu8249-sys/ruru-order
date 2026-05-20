// app/admin-v2/combine/page.tsx
// 목적: 관리자 v2 합배송 시간 설정 페이지
// 주의: settings 테이블의 합배송 시간 설정만 저장합니다.
// 주문금액, 기존 주문 재계산, 입금매칭, 정산 로직은 건드리지 않습니다.

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

const formatLocalLabel = (value: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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

  const startIsoPreview = useMemo(() => fromDateTimeLocalValue(startLocal), [startLocal]);
  const endIsoPreview = useMemo(() => fromDateTimeLocalValue(endLocal), [endLocal]);

  const isValidRange = useMemo(() => {
    if (!startIsoPreview || !endIsoPreview) return false;
    return new Date(startIsoPreview).getTime() < new Date(endIsoPreview).getTime();
  }, [startIsoPreview, endIsoPreview]);

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
      { key: "combine_shipping_enabled", value: enabled ? "true" : "false" },
      { key: "combine_shipping_start_at", value: startIso },
      { key: "combine_shipping_end_at", value: endIso },
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
      { key: "combine_shipping_enabled", value: "false" },
      { key: "combine_shipping_end_at", value: new Date().toISOString() },
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
    <main className="min-h-screen bg-[#f6f8fc] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div>
            <div className="text-[13px] font-black text-blue-600">루루동이 관리자</div>
            <h1 className="mt-1 text-[30px] font-black tracking-[-0.06em]">
              합배송 설정
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin-v2"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition active:scale-[0.98]"
            >
              관리자 홈
            </Link>

            <button
              type="button"
              onClick={loadSettings}
              disabled={loading || saving}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-100 transition active:scale-[0.98] disabled:opacity-60"
            >
              새로고침
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1440px] gap-5 px-6 py-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-black text-blue-600">배송비 중복 방지</div>
              <h2 className="mt-1 text-[24px] font-black tracking-[-0.05em]">
                방송 합배송 시간
              </h2>
              <p className="mt-1 text-[13px] font-bold text-slate-500">
                같은 전화번호 고객이 설정 시간 안에서 이미 배송비를 낸 주문이 있으면, 다음 주문 배송비를 0원으로 판단합니다.
              </p>
            </div>

            <div
              className={`rounded-full px-4 py-2 text-sm font-black ${
                enabled
                  ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                  : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
              }`}
            >
              {enabled ? "합배송 ON" : "합배송 OFF"}
            </div>
          </div>

          {loading ? (
            <div className="rounded-[22px] bg-slate-50 py-20 text-center text-sm font-black text-slate-500">
              설정 불러오는 중...
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[13px] font-black text-slate-500">현재 상태</div>
                  <div className={`mt-2 text-[22px] font-black ${enabled ? "text-green-600" : "text-slate-500"}`}>
                    {enabled ? "ON" : "OFF"}
                  </div>
                </div>

                <div className="rounded-[22px] border border-blue-100 bg-blue-50 p-4">
                  <div className="text-[13px] font-black text-blue-600">시작</div>
                  <div className="mt-2 text-[18px] font-black text-slate-950">
                    {formatLocalLabel(startIsoPreview)}
                  </div>
                </div>

                <div className="rounded-[22px] border border-blue-100 bg-blue-50 p-4">
                  <div className="text-[13px] font-black text-blue-600">마감</div>
                  <div className="mt-2 text-[18px] font-black text-slate-950">
                    {formatLocalLabel(endIsoPreview)}
                  </div>
                </div>
              </div>

              <label className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-white p-4">
                <div>
                  <div className="text-[17px] font-black">{SETTING_LABELS.enabled}</div>
                  <div className="mt-1 text-[13px] font-bold text-slate-500">
                    ON이면 설정 시간 안에서 같은 고객 배송비 중복을 막습니다.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  className="h-6 w-6 accent-blue-600"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-black text-slate-700">
                    {SETTING_LABELS.startAt}
                  </label>
                  <input
                    type="datetime-local"
                    value={startLocal}
                    onChange={(event) => setStartLocal(event.target.value)}
                    className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white p-4 font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                <div>
                  <label className="text-sm font-black text-slate-700">
                    {SETTING_LABELS.endAt}
                  </label>
                  <input
                    type="datetime-local"
                    value={endLocal}
                    onChange={(event) => setEndLocal(event.target.value)}
                    className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white p-4 font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  />
                </div>
              </div>

              {!isValidRange && (
                <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-600">
                  합배송 마감시간은 시작시간보다 늦어야 합니다.
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={applyTonightDefault}
                  className="rounded-[18px] border border-blue-100 bg-blue-50 p-4 text-sm font-black text-blue-700 transition active:scale-[0.98]"
                >
                  오늘 19:00 ~ 내일 04:00
                </button>

                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving || !isValidRange}
                  className="rounded-[18px] bg-blue-600 p-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "합배송 설정 저장"}
                </button>

                <button
                  type="button"
                  onClick={forceEndNow}
                  disabled={saving}
                  className="rounded-[18px] border border-red-200 bg-white p-4 text-sm font-black text-red-600 transition active:scale-[0.98] disabled:opacity-50"
                >
                  합배송 강제 종료
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="grid gap-4">
          <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="text-[17px] font-black">운영 기준</div>
            <div className="mt-4 grid gap-3 text-[13px] font-bold leading-relaxed text-slate-600">
              <div className="rounded-2xl bg-green-50 p-3 text-green-700 ring-1 ring-green-100">
                저장 후 새 주문부터 적용됩니다.
              </div>
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100">
                기존 주문 금액은 재계산하지 않습니다.
              </div>
              <div className="rounded-2xl bg-red-50 p-3 text-red-600 ring-1 ring-red-100">
                강제종료 후 새 주문은 배송비가 다시 붙습니다.
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-blue-100 bg-blue-50 p-5">
            <div className="text-[17px] font-black text-blue-900">
              방송이 밤 12시를 넘길 때
            </div>
            <p className="mt-3 text-[13px] font-bold leading-relaxed text-blue-800">
              예: 토요일 19:00 시작, 일요일 새벽 04:00 마감으로 설정하면 날짜가 넘어가도 같은 합배송 기준으로 묶을 수 있습니다.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}
