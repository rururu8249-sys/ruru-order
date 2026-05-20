// app/admin-v2/combine/page.tsx
// 목적: 관리자 v2 시간지정 합배송 설정 페이지
// 주의:
// - 이 화면은 자정 넘김 방송/특정 시간대 묶음용 추가 설정입니다.
// - 기본 같은 날짜 자동합배송 로직을 대체하지 않습니다.
// - 주문금액, 기존 주문 재계산, 입금매칭, 정산 로직은 건드리지 않습니다.

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
  enabled: "시간지정 합배송 사용",
  startAt: "합배송 시작 시간",
  endAt: "합배송 마감 시간",
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
      alert(`${SETTING_LABELS.startAt}을 입력해주세요.`);
      return;
    }

    if (!endLocal) {
      alert(`${SETTING_LABELS.endAt}을 입력해주세요.`);
      return;
    }

    const startIso = fromDateTimeLocalValue(startLocal);
    const endIso = fromDateTimeLocalValue(endLocal);

    if (!startIso || !endIso) {
      alert("합배송 시간을 다시 확인해주세요.");
      return;
    }

    if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      alert("합배송 마감 시간은 시작 시간보다 늦어야 합니다.");
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

    alert("시간지정 합배송 설정을 저장했습니다.");
  };

  const applyTonightDefault = () => {
    const tonight = getDefaultTonightCombineWindow();

    setEnabled(true);
    setStartLocal(tonight.startLocal);
    setEndLocal(tonight.endLocal);
  };

  const forceEndNow = async () => {
    if (!confirm("시간지정 합배송을 종료할까요?\n\n종료 후 새 주문은 기본 같은날 합배송 기준으로 다시 판단됩니다.")) {
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
      alert("종료 오류: " + error.message);
      return;
    }

    alert("시간지정 합배송을 종료했습니다.");
  };

  return (
    <main className="min-h-screen bg-[#f6f8fc] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div>
            <div className="text-[13px] font-black text-blue-600">루루동이 관리자</div>
            <h1 className="mt-1 text-[30px] font-black tracking-[-0.06em]">
              시간지정 합배송 설정
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

      <section className="mx-auto grid max-w-[1440px] gap-5 px-6 py-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-black text-blue-600">
                자정 넘김 방송용 추가 설정
              </div>
              <h2 className="mt-1 text-[24px] font-black tracking-[-0.05em]">
                시간지정 합배송 기준
              </h2>
              <p className="mt-2 max-w-[920px] text-[14px] font-bold leading-relaxed text-slate-600">
                평소에는 같은 날짜 안에서 같은 전화번호 고객 주문이 기본 자동합배송으로 판단됩니다.
                <br />
                이 화면은 방송이 밤 12시를 넘기거나, 특정 방송 시간대로 합배송을 묶어야 할 때만 사용하세요.
              </p>
            </div>

            <div
              className={`rounded-full px-4 py-2 text-sm font-black ${
                enabled
                  ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                  : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
              }`}
            >
              {enabled ? "시간지정 ON" : "시간지정 OFF"}
            </div>
          </div>

          <div className="mb-5 rounded-[22px] border border-blue-100 bg-blue-50 px-4 py-3 text-[14px] font-black leading-relaxed text-blue-800">
            기본 같은날 자동합배송은 별도로 적용됩니다. 여기서는 “날짜가 넘어가는 방송”만 시간으로 묶어주는 보조 설정입니다.
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
                    {enabled ? "시간지정 ON" : "시간지정 OFF"}
                  </div>
                </div>

                <div className="rounded-[22px] border border-blue-100 bg-blue-50 p-4">
                  <div className="text-[13px] font-black text-blue-600">시간지정 시작</div>
                  <div className="mt-2 text-[18px] font-black text-slate-950">
                    {formatLocalLabel(startIsoPreview)}
                  </div>
                </div>

                <div className="rounded-[22px] border border-blue-100 bg-blue-50 p-4">
                  <div className="text-[13px] font-black text-blue-600">시간지정 마감</div>
                  <div className="mt-2 text-[18px] font-black text-slate-950">
                    {formatLocalLabel(endIsoPreview)}
                  </div>
                </div>
              </div>

              <label className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-white p-4">
                <div>
                  <div className="text-[17px] font-black">{SETTING_LABELS.enabled}</div>
                  <div className="mt-1 text-[13px] font-bold leading-relaxed text-slate-500">
                    방송이 밤 12시를 넘기거나 특정 시간 범위로 합배송을 묶어야 할 때만 켜주세요.
                    <br />
                    평소 같은 날짜 주문은 기본 합배송 기준으로 처리됩니다.
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
                  합배송 마감 시간은 시작 시간보다 늦어야 합니다.
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={applyTonightDefault}
                  className="rounded-[18px] border border-blue-100 bg-blue-50 p-4 text-sm font-black text-blue-700 transition active:scale-[0.98]"
                >
                  오늘 밤 방송 시간 자동입력
                </button>

                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving || !isValidRange}
                  className="rounded-[18px] bg-blue-600 p-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "시간지정 합배송 저장"}
                </button>

                <button
                  type="button"
                  onClick={forceEndNow}
                  disabled={saving}
                  className="rounded-[18px] border border-red-200 bg-white p-4 text-sm font-black text-red-600 transition active:scale-[0.98] disabled:opacity-50"
                >
                  시간지정 합배송 종료
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="grid gap-4">
          <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <div className="text-[17px] font-black">헷갈리지 않는 기준</div>

            <div className="mt-4 grid gap-3 text-[13px] font-bold leading-relaxed">
              <div className="rounded-2xl bg-green-50 p-3 text-green-700 ring-1 ring-green-100">
                기본: 같은 날짜 안에서 같은 전화번호 고객은 자동합배송으로 판단합니다.
              </div>

              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100">
                시간지정: 방송이 자정을 넘기거나 특정 방송 시간으로 묶을 때만 사용합니다.
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-slate-700 ring-1 ring-slate-100">
                첫 주문은 기본 배송비가 붙고, 같은 기준 안의 다음 주문은 배송비 0원으로 판단됩니다.
              </div>

              <div className="rounded-2xl bg-red-50 p-3 text-red-600 ring-1 ring-red-100">
                기존 주문 금액은 다시 계산하지 않습니다.
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-blue-100 bg-blue-50 p-5">
            <div className="text-[17px] font-black text-blue-900">
              예시
            </div>
            <p className="mt-3 text-[13px] font-bold leading-relaxed text-blue-800">
              토요일 밤 19:00 방송이 일요일 새벽 04:00까지 이어지면,
              시간지정 합배송을 19:00 ~ 다음날 04:00으로 잡아두면 됩니다.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}
