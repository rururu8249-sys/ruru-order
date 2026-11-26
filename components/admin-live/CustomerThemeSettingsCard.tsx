"use client";
// components/admin-live/CustomerThemeSettingsCard.tsx
// [2026-11-26 전면 리뉴얼 VER 3] 설정 › 주문서 표시 맨 위 «손님 화면 테마» — 기본(따뜻한 흰+초록) / 겨울(크리스마스).
//   settings customer_theme 한 칸만 바로 저장(다른 설정 저장과 섞지 않음). 색·장식만 — 주문·금액 무관.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import { CUSTOMER_THEME_KEY, parseCustomerTheme, type CustomerTheme } from "@/lib/customerTheme";

const OPTIONS: { value: CustomerTheme; label: string; sub: string; swatch: [string, string] }[] = [
  { value: "basic", label: "기본", sub: "따뜻한 흰 + 초록", swatch: ["#FBFAF7", "#1f5a45"] },
  { value: "winter", label: "겨울", sub: "크리스마스 · 눈", swatch: ["#173f2c", "#c0262d"] },
];

export default function CustomerThemeSettingsCard() {
  const [theme, setTheme] = useState<CustomerTheme | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.from("settings").select("value").eq("key", CUSTOMER_THEME_KEY).maybeSingle().then(({ data }) => {
      if (alive) setTheme(parseCustomerTheme(data?.value));
    });
    return () => { alive = false; };
  }, []);

  const pick = async (next: CustomerTheme) => {
    if (saving || next === theme) return;
    setSaving(true);
    const { error } = await supabase.from("settings").upsert([{ key: CUSTOMER_THEME_KEY, value: next }], { onConflict: "key" });
    setSaving(false);
    if (error) { showAdminToast("테마 저장 실패\n\n" + error.message, "error"); return; }
    setTheme(next);
    showAdminToast(next === "winter" ? "손님 화면을 겨울로 바꿨어요" : "손님 화면을 기본으로 바꿨어요", "success");
  };

  return (
    <div className="mb-3 rounded-xl border border-line bg-surface p-4">
      <div className="text-sm font-black text-ink">손님 화면 테마</div>
      <div className="mt-1 text-xs font-bold text-ink-mute">누르면 바로 바뀌어요. 손님은 새로고침하면 보여요.</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => {
          const on = theme === o.value;
          return (
            <button key={o.value} type="button" disabled={theme === null || saving} aria-pressed={on} onClick={() => void pick(o.value)}
              className={`flex min-h-[64px] items-center gap-3 rounded-xl px-3 text-left ${on ? "border-2 border-ink bg-surface" : "border border-line bg-surface"} disabled:opacity-60`}>
              <span aria-hidden className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-line">
                <span className="h-full w-1/2" style={{ background: o.swatch[0] }} />
                <span className="h-full w-1/2" style={{ background: o.swatch[1] }} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-ink">{o.label}{on ? " · 사용 중" : ""}</span>
                <span className="block text-xs font-bold text-ink-mute">{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
