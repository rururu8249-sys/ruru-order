"use client";
// components/admin-live/PromoPopupEditor.tsx
// 2026-11-01 — 설정 › 손님 공지 「안내 팝업」 편집 칸 + 미리보기.
// 값만 바꾸고(onChange) 저장은 부모(AdminLiveNoticePanel 「공지 저장」)가 settings promo_popup_v1 로 한다.
// 사진 올리기는 기존 상품 사진 업로드 라우트(/api/admin-live/product-images/upload) 재사용.
// 표시·입력 전용. 돈/주문/입금/배송 로직 무관.

import { useRef, useState } from "react";
import PromoPopupCard from "@/components/customer/PromoPopupCard";
import {
  PROMO_POPUP_MAX_BUTTONS,
  isValidPromoUrl,
  type PromoPopupConfig,
  type PromoPopupIcon,
} from "@/lib/promoPopup";
import { YOUTUBE_CHANNEL_WEB_URL } from "@/lib/youtubeChannelLink";

const label = "block text-[13px] font-semibold text-ink";
const input = "mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-[14px] text-ink outline-none focus-visible:border-ink";
const help = "mt-1 block text-[12px] text-ink-mute";
const chip = (on: boolean) =>
  `h-9 rounded-lg border px-3 text-[13px] font-bold ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`;

export default function PromoPopupEditor({
  value,
  onChange,
  disabled,
}: {
  value: PromoPopupConfig;
  onChange: (next: PromoPopupConfig) => void;
  disabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const set = (patch: Partial<PromoPopupConfig>) => onChange({ ...value, ...patch });

  const setButton = (i: number, patch: { label?: string; url?: string }) =>
    set({ buttons: value.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const upload = async (file: File) => {
    setUploadError("");
    if (!file.type.startsWith("image/")) {
      setUploadError("사진 파일만 올릴 수 있어요.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("5MB 이하 사진만 올릴 수 있어요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "detail");
      const res = await fetch("/api/admin-live/product-images/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.url) {
        setUploadError(String(json?.message || "사진 올리기 실패"));
        return;
      }
      set({ icon: "image", imageUrl: String(json.url) });
    } catch {
      setUploadError("사진 올리기 실패 — 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const icons: [PromoPopupIcon, string][] = [
    ["youtube", "유튜브 그림"],
    ["play", "검정 재생"],
    ["image", "사진 올리기"],
    ["none", "없음"],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={disabled} onClick={() => set({ enabled: !value.enabled })} className={chip(value.enabled)}>
            {value.enabled ? "팝업 ON" : "팝업 OFF"}
          </button>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            끝나는 날
            <input
              type="date"
              value={value.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              className="h-9 rounded-lg border border-line bg-white px-2 text-[14px]"
            />
          </label>
          {value.endDate ? (
            <button type="button" onClick={() => set({ endDate: "" })} className="text-[13px] font-semibold text-ink-mute underline">
              날짜 지우기
            </button>
          ) : null}
        </div>
        <span className={help}>끝나는 날을 넣으면 그날까지만 뜨고 저절로 꺼져요. 비우면 끌 때까지 계속 떠요.</span>

        <div className="mt-4">
          <span className={label}>맨 위 그림</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {icons.map(([k, name]) => (
              <button
                key={k}
                type="button"
                onClick={() => (k === "image" && !value.imageUrl ? fileRef.current?.click() : set({ icon: k }))}
                className={chip(value.icon === k)}
              >
                {name}
              </button>
            ))}
            {value.icon === "image" ? (
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="text-[13px] font-semibold text-ink underline">
                {uploading ? "올리는 중…" : value.imageUrl ? "다른 사진으로" : "사진 고르기"}
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </div>
          {uploadError ? <span className="mt-1 block text-[12px] font-semibold text-danger-tx">{uploadError}</span> : null}
          <span className={help}>가로로 긴 로고는 PNG(배경 투명)가 가장 깔끔해요.</span>
        </div>

        <label className="mt-4 block">
          <span className={label}>제목</span>
          <input value={value.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} className={input} />
        </label>

        <label className="mt-4 block">
          <span className={label}>내용</span>
          <textarea
            value={value.body}
            maxLength={600}
            rows={6}
            onChange={(e) => set({ body: e.target.value })}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[14px] leading-6 text-ink outline-none focus-visible:border-ink"
          />
          <span className={help}>줄바꿈 그대로 보여요. **글자** 처럼 별 두 개로 감싸면 굵게 나와요.</span>
        </label>

        <div className="mt-4">
          <span className={label}>버튼 (최대 {PROMO_POPUP_MAX_BUTTONS}개 · 누르면 그 주소로 가고 24시간 안 떠요)</span>
          <div className="mt-1 space-y-2">
            {value.buttons.map((b, i) => {
              const bad = b.url.trim() !== "" && !isValidPromoUrl(b.url);
              return (
                <div key={i} className="rounded-lg border border-line p-2">
                  <div className="flex gap-2">
                    <input
                      value={b.label}
                      maxLength={30}
                      placeholder="버튼 글자"
                      onChange={(e) => setButton(i, { label: e.target.value })}
                      className="h-10 w-40 shrink-0 rounded-lg border border-line bg-white px-3 text-[14px]"
                    />
                    <input
                      value={b.url}
                      placeholder="https://… 주소"
                      onChange={(e) => setButton(i, { url: e.target.value })}
                      className={`h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-[14px] ${bad ? "border-warn-tx" : "border-line"}`}
                    />
                    <button
                      type="button"
                      onClick={() => set({ buttons: value.buttons.filter((_, j) => j !== i) })}
                      className="h-10 shrink-0 px-2 text-[13px] font-semibold text-danger-tx"
                    >
                      삭제
                    </button>
                  </div>
                  {bad ? <span className="mt-1 block text-[12px] font-semibold text-warn-tx">주소는 https:// 로 시작해야 해요. 이대로면 저장할 때 빠져요.</span> : null}
                </div>
              );
            })}
          </div>
          {value.buttons.length < PROMO_POPUP_MAX_BUTTONS ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => set({ buttons: [...value.buttons, { label: "", url: "" }] })} className={chip(false)}>
                + 버튼 추가
              </button>
              {!value.buttons.some((b) => b.url.includes("UCdBYg0tDtLZnpvz8v1NKURA")) ? (
                <button
                  type="button"
                  onClick={() => set({ buttons: [...value.buttons, { label: "새 채널 바로가기", url: YOUTUBE_CHANNEL_WEB_URL }] })}
                  className={chip(false)}
                >
                  + 유튜브 채널 버튼
                </button>
              ) : null}
            </div>
          ) : null}
          <span className={help}>유튜브·네이버밴드 주소는 폰에서 그 앱으로 열려요.</span>
        </div>
      </div>

      <div>
        <span className={label}>미리보기</span>
        <div className="mt-1 flex justify-center rounded-xl bg-[#6b6b6b] p-4">
          <PromoPopupCard cfg={value} onButton={() => {}} onClose={() => {}} onHide24={() => {}} />
        </div>
        {!value.enabled ? <span className={help}>OFF — 손님에게 안 떠요.</span> : null}
      </div>
    </div>
  );
}
