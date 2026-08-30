"use client";

// components/admin-live/AdminLiveNoticePanel.tsx
//
// [2026-08-30] 관리자 「📢 공지·쪽지」 — 흩어져 있던 손님 공지를 한자리에 모은다.
//
// 옮겨온 곳: 설정 → 주문서 표시 안의 「📢 접속 팝업 공지」 + 「주문서 공지 문구」
//   설정 패널에서는 같은 항목을 뺐다. 두 화면이 같은 키를 저장하면
//   한쪽에서 고친 걸 다른 쪽 저장이 되돌려버리기 때문이다(설정 저장은 키를 통째로 upsert 한다).
//
// 건드리는 표: settings (아래 NOTICE_KEYS 7개뿐)
//   주문·입금·정산·배송·포인트·Bankda 와 겹치는 칸은 하나도 없다.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";

/** 이 화면이 저장하는 키 — 여기 없는 키는 절대 건드리지 않는다. */
const NOTICE_KEYS = [
  "popup_notice_enabled",
  "popup_notice_title",
  "popup_notice_text",
  "popup_notice_fontsize",
  "popup_notice_color",
  "popup_band_url",
  "notice_text",
] as const;

const DEFAULT_BAND_URL = "https://band.us/@ruru8249";
const clean = (v: unknown) => String(v ?? "").trim();

const FONT_LABEL: Record<string, string> = { normal: "보통", large: "크게", xlarge: "아주 크게" };
const FONT_PX: Record<string, number> = { normal: 14, large: 16, xlarge: 18 };

export default function AdminLiveNoticePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [popupEnabled, setPopupEnabled] = useState(false);
  const [popupTitle, setPopupTitle] = useState("");
  const [popupText, setPopupText] = useState("");
  const [popupFont, setPopupFont] = useState("normal");
  const [popupColor, setPopupColor] = useState("#7B2D43");
  const [popupBandUrl, setPopupBandUrl] = useState(DEFAULT_BAND_URL);
  const [noticeText, setNoticeText] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("settings").select("key,value").in("key", NOTICE_KEYS as unknown as string[]);
        if (!alive) return;
        if (error) {
          showAdminToast("공지 설정 불러오기 실패\n\n" + error.message, "error");
          return;
        }
        const rows = (data || []) as { key: string; value: string | number | null }[];
        const get = (k: string) => rows.find((r) => r.key === k)?.value;
        setPopupEnabled(clean(get("popup_notice_enabled")) === "true");
        setPopupTitle(String(get("popup_notice_title") ?? ""));
        setPopupText(String(get("popup_notice_text") ?? ""));
        setPopupFont(clean(get("popup_notice_fontsize")) || "normal");
        setPopupColor(clean(get("popup_notice_color")) || "#7B2D43");
        setPopupBandUrl(clean(get("popup_band_url")) || DEFAULT_BAND_URL);
        setNoticeText(String(get("notice_text") ?? ""));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("settings").upsert(
        [
          { key: "popup_notice_enabled", value: popupEnabled ? "true" : "false" },
          { key: "popup_notice_title", value: popupTitle.trim() },
          { key: "popup_notice_text", value: popupText },
          { key: "popup_notice_fontsize", value: popupFont },
          { key: "popup_notice_color", value: popupColor },
          { key: "popup_band_url", value: popupBandUrl.trim() },
          { key: "notice_text", value: noticeText },
        ],
        { onConflict: "key" },
      );
      if (error) {
        showAdminToast("공지 저장 실패\n\n" + error.message, "error");
        return;
      }
      showAdminToast("공지를 저장했습니다. 손님이 새로 들어오면 보입니다.", "success");
    } finally {
      setSaving(false);
    }
  };

  const card = "rounded-[20px] border border-line bg-surface-2 p-4";
  const input = "mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-deep";
  const label = "text-xs font-black text-ink-soft";
  const help = "mt-1 block text-[11px] font-bold leading-5 text-ink-mute";

  // 미리보기 — 손님 팝업이 --- 를 가로줄로 바꿔 보여주는 것과 같은 방식
  const previewBlocks = popupText.split(/\n/).reduce<string[][]>((acc, line) => {
    if (line.trim() === "---") acc.push([]);
    else acc[acc.length - 1].push(line);
    return acc;
  }, [[]]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* ─────────── 왼쪽: 입력 ─────────── */}
          <div className="space-y-4">
            {/* 접속 팝업 공지 */}
            <div className={card}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-ink">📢 접속 팝업 공지</div>
                  <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
                    손님이 사이트에 들어오자마자 뜨는 팝업입니다. 밴드 바로가기 + 24시간 안 보기 + 확인 버튼이 같이 나옵니다.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPopupEnabled((v) => !v)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${popupEnabled ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
                >
                  {popupEnabled ? "팝업 ON" : "팝업 OFF"}
                </button>
              </div>

              <label className="mt-3 block">
                <span className={label}>제목 (팝업 위 색상 띠 글씨)</span>
                <input
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  placeholder="예) 📢 중요 공지  ·  비우면 제목 띠 없이 본문만 표시"
                  className={input}
                />
                <span className={help}>본문에 제목을 또 쓰면 두 번 나옵니다.</span>
              </label>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={label}>팝업 문구 (본문 · 줄바꿈 가능)</span>
                  <button
                    type="button"
                    onClick={() => setPopupText((prev) => (prev.endsWith("\n") || prev === "" ? prev : prev + "\n") + "---\n")}
                    className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-black text-ink-soft"
                  >
                    ─ 구분선 넣기
                  </button>
                </div>
                <textarea
                  value={popupText}
                  onChange={(e) => setPopupText(e.target.value)}
                  placeholder={"예) 👜 롱샴 7/27(월) 출고완료\n---\n💄 향수&화장품 7/27(월)~ 업체 순차출고"}
                  rows={6}
                  className="mt-1 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm font-bold leading-relaxed text-ink outline-none focus:border-rose-deep"
                />
                <span className={help}>
                  한 줄에 <b className="text-ink-soft">---</b> 만 쓰면 손님 팝업에서 그 자리에 가로 구분선이 그어집니다.
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={label}>글자 크기</span>
                  <select value={popupFont} onChange={(e) => setPopupFont(e.target.value)} className={input}>
                    <option value="normal">보통</option>
                    <option value="large">크게</option>
                    <option value="xlarge">아주 크게</option>
                  </select>
                </label>
                <label className="block">
                  <span className={label}>강조 색상 (제목·확인 버튼)</span>
                  <select value={popupColor} onChange={(e) => setPopupColor(e.target.value)} className={input}>
                    <option value="#7B2D43">딥로즈</option>
                    <option value="#0F6E56">초록</option>
                    <option value="#185FA5">파랑</option>
                    <option value="#1A1A1A">검정</option>
                    <option value="#C0392B">빨강</option>
                  </select>
                </label>
              </div>

              <label className="mt-3 block">
                <span className={label}>밴드 바로가기 주소</span>
                <input value={popupBandUrl} onChange={(e) => setPopupBandUrl(e.target.value)} placeholder={DEFAULT_BAND_URL} className={input} />
                <span className={help}>비우면 밴드 버튼이 숨겨집니다.</span>
              </label>
            </div>

            {/* 상시 안내 문구 */}
            <div className={card}>
              <div className="text-sm font-black text-ink">📌 쇼핑 전 꼭 확인 (상시 안내)</div>
              <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
                손님 <b className="text-ink-soft">쪽지함 맨 위</b>에 항상 보이는 안내입니다. 사이즈 오차·교환반품 비용처럼
                <b className="text-ink-soft"> 늘 해당되는 내용</b>을 넣으세요. 비우면 안 보입니다.
              </div>
              <textarea
                value={noticeText}
                onChange={(e) => setNoticeText(e.target.value)}
                placeholder={"예) 사이즈는 측정 방법에 따라 차이가 있어 100% 정확하지 않을 수 있습니다.\n단순 변심 교환·반품 시 택배비를 포함해 10,000원의 비용이 발생할 수 있습니다."}
                rows={4}
                className="mt-3 w-full resize-none rounded-xl border border-line bg-surface p-3 text-sm font-bold leading-relaxed text-ink outline-none focus:border-rose-deep"
              />
              <div className="mt-2 rounded-xl border border-line bg-warn-bg px-3 py-2 text-[11px] font-bold leading-5 text-warn-tx">
                예전엔 「설정 → 주문서 표시 → 주문서 공지 문구」였습니다. 같은 내용이고, 여기서 고치면 됩니다.
              </div>
            </div>
          </div>

          {/* ─────────── 오른쪽: 미리보기 ─────────── */}
          <div className="lg:sticky lg:top-0 lg:self-start">
            <div className="rounded-[20px] border border-line bg-surface-2 p-4">
              <div className="text-sm font-black text-ink">👀 손님 화면 미리보기</div>
              <div className="mt-1 text-[11px] font-bold text-ink-mute">저장 전 모습입니다. 실제 반영은 저장 후.</div>

              <div className="mt-3 rounded-2xl bg-slate-900/70 p-4">
                {popupEnabled && popupText.trim() ? (
                  <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
                    {popupTitle.trim() ? (
                      <div className="px-4 py-2.5 text-center text-[13px] font-black text-white" style={{ background: popupColor }}>
                        {popupTitle}
                      </div>
                    ) : null}
                    <div className="px-4 py-4">
                      {previewBlocks.map((block, i) => (
                        <div key={i}>
                          {i > 0 ? <div className="my-3 border-t border-slate-200" /> : null}
                          <p
                            className="whitespace-pre-line text-center font-bold leading-relaxed text-slate-700"
                            style={{ fontSize: `${FONT_PX[popupFont] ?? 14}px` }}
                          >
                            {block.join("\n").trim()}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 px-4 pb-4">
                      {popupBandUrl.trim() ? (
                        <div className="rounded-xl bg-[#00C73C] py-2.5 text-center text-[13px] font-black text-white">🟢 밴드 바로가기</div>
                      ) : null}
                      <div className="rounded-xl py-2.5 text-center text-[13px] font-black text-white" style={{ background: popupColor }}>확인</div>
                      <div className="pt-1 text-center text-[11px] font-bold text-slate-400">24시간 동안 열지 않기</div>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs font-bold text-white/60">
                    {popupEnabled ? "본문이 비어 있어 팝업이 안 뜹니다." : "팝업 OFF — 손님에게 안 뜹니다."}
                  </div>
                )}
              </div>

              <div className="mt-3 text-[11px] font-black text-ink-soft">쪽지함 맨 위</div>
              <div className="mt-1 rounded-2xl border border-rose-line bg-rose-soft/40 p-3">
                {noticeText.trim() ? (
                  <>
                    <div className="text-[11px] font-black text-ink-mute">📌 쇼핑 전 꼭 확인</div>
                    <p className="mt-1 whitespace-pre-line text-[12px] font-bold leading-5 text-ink-soft">{noticeText}</p>
                  </>
                ) : (
                  <div className="py-4 text-center text-[11px] font-bold text-ink-mute">비어 있어 안 보입니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 저장바 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3">
        <span className="text-xs font-bold text-ink-mute">
          {loading ? "불러오는 중..." : "저장하면 손님이 새로 들어올 때부터 보입니다."}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-full bg-rose-deep px-6 py-2.5 text-sm font-black text-white transition disabled:opacity-50"
        >
          {saving ? "저장 중..." : "공지 저장"}
        </button>
      </div>
    </div>
  );
}
