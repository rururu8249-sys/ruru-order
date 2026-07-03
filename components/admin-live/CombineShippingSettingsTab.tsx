"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import {
  COMBINE_SHIPPING_SETTING_KEYS,
  parseCombineShippingSettings,
  toDateTimeLocalValue,
  fromDateTimeLocalValue,
  DEFAULT_COMBINE_SHIPPING_SETTINGS,
  isCombineShippingActiveNow,
} from "@/lib/admin-v2/combineShipping";

export default function CombineShippingSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(DEFAULT_COMBINE_SHIPPING_SETTINGS.enabled);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  // 저장된 값(뱃지 판정용) — 편집 중인 입력칸이 아니라 확정 저장값 기준
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [savedStartAt, setSavedStartAt] = useState("");
  const [savedEndAt, setSavedEndAt] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("key,value")
          .in("key", COMBINE_SHIPPING_SETTING_KEYS as unknown as string[]);

        if (!alive) return;

        if (error) {
          showAdminToast("합배송 설정 불러오기 실패\n\n" + error.message, "error");
          return;
        }

        const parsed = parseCombineShippingSettings(data);
        setEnabled(parsed.enabled);
        setStartLocal(toDateTimeLocalValue(parsed.startAt));
        setEndLocal(toDateTimeLocalValue(parsed.endAt));
        setSavedEnabled(parsed.enabled);
        setSavedStartAt(parsed.startAt);
        setSavedEndAt(parsed.endAt);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    const startAt = fromDateTimeLocalValue(startLocal);
    const endAt = fromDateTimeLocalValue(endLocal);

    if (enabled) {
      // 3. 빈칸 차단
      if (!startAt || !endAt) {
        showAdminToast("합배송 시간을 사용하려면 시작·종료 시각을 모두 입력하세요.", "warning");
        return;
      }
      const startMs = new Date(startAt).getTime();
      const endMs = new Date(endAt).getTime();
      // 기존: 시작 >= 종료 차단
      if (startMs >= endMs) {
        showAdminToast("종료 시각은 시작 시각보다 뒤여야 합니다.", "warning");
        return;
      }
      // 1. 종료가 이미 과거(만료된 범위) 차단 — 잘못 저장하면 사실상 적용 안 됨
      if (endMs <= Date.now()) {
        showAdminToast(
          "종료 시간이 이미 지났습니다. 미래 시간으로 설정하세요(지금은 오늘 기준 적용됨).",
          "warning",
        );
        return;
      }
      // 2. 범위가 7일 초과면 확인 — 그 기간 같은 번호 주문 전부 배송비 0원
      const rangeDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
      if (rangeDays > 7) {
        const ok = window.confirm(
          `합배송 범위가 약 ${Math.round(rangeDays)}일입니다. 그 기간 같은 번호 주문이 전부 배송비 0원 됩니다. 계속?`,
        );
        if (!ok) return;
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("settings").upsert(
        [
          { key: "combine_shipping_enabled", value: enabled ? "true" : "false" },
          { key: "combine_shipping_start_at", value: startAt },
          { key: "combine_shipping_end_at", value: endAt },
        ],
        { onConflict: "key" },
      );

      if (error) {
        showAdminToast("합배송 설정 저장 실패\n\n" + error.message, "error");
        return;
      }

      setSavedEnabled(enabled);
      setSavedStartAt(startAt);
      setSavedEndAt(endAt);
      showAdminToast("합배송 설정을 저장했습니다.", "success");
    } finally {
      setSaving(false);
    }
  };

  const activeNow = isCombineShippingActiveNow({
    enabled: savedEnabled,
    startAt: savedStartAt,
    endAt: savedEndAt,
  });

  // 현재상태 3단계(저장 확정값 기준): 사용중 / 예정 / 꺼짐·만료
  const savedStartMs = savedStartAt ? new Date(savedStartAt).getTime() : NaN;
  const isUpcoming =
    savedEnabled && Number.isFinite(savedStartMs) && Date.now() < savedStartMs && !activeNow;
  const status = activeNow ? "active" : isUpcoming ? "upcoming" : "off";
  const statusLabel = status === "active" ? "🟢 사용중" : status === "upcoming" ? "🟡 예정" : "⚪ 꺼짐·만료";
  const statusClass =
    status === "active"
      ? "bg-ok-bg text-ok-tx"
      : status === "upcoming"
        ? "bg-warn-bg text-warn-tx"
        : "bg-surface-2 text-ink-mute";

  // 4. 빠른설정: 오늘 18:00 ~ 내일 05:00
  const applyTonightPreset = () => {
    const start = new Date();
    start.setHours(18, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(5, 0, 0, 0);
    setStartLocal(toDateTimeLocalValue(start.toISOString()));
    setEndLocal(toDateTimeLocalValue(end.toISOString()));
  };

  const clearTimes = () => {
    setStartLocal("");
    setEndLocal("");
  };

  if (loading) {
    return <div className="rounded-2xl border border-line bg-surface px-4 py-6 text-sm font-bold text-ink-mute">불러오는 중…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-warn-bg px-4 py-3 text-xs font-bold leading-5 text-warn-tx">
        방송 OFF일 때 이 시간범위 안에서 같은 전화번호로 들어온 주문은 배송비 0원(합배송)으로 처리됩니다.
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-ink">합배송 시간 사용</div>
            <div className="mt-0.5 text-[11px] font-bold text-ink-mute">
              끄면 이 설정은 무시됩니다(기본 배송비 적용).
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusClass}`}>
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-rose-deep" : "bg-surface-2 border border-line"}`}
              aria-pressed={enabled}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`}
              />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyTonightPreset}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-black text-ink-soft transition hover:border-rose-deep"
          >
            오늘 방송(18:00~내일05:00)
          </button>
          <button
            type="button"
            onClick={clearTimes}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-black text-ink-mute transition hover:border-rose-deep"
          >
            지우기
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-black text-ink-soft">시작</span>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-ink outline-none focus:border-rose-deep"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-ink-soft">종료</span>
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-ink outline-none focus:border-rose-deep"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-rose-deep px-4 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
