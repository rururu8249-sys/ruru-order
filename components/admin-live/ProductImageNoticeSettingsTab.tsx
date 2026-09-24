"use client";

// components/admin-live/ProductImageNoticeSettingsTab.tsx
// [2026-09-24 사장님] 「상품사진 업로드 할때 오른쪽 하단에 … 검정 반투명 … 체크하면 문구가 들어가고」
//
//   · 저장은 /api/admin-live/product-image-notice (관리자 세션 + 서비스롤).
//     여기서 settings 를 직접 쓰지 않는다.
//   · 문구는 «사진에 구워진다»(A안). 한 번 올린 사진은 되돌릴 수 없으므로
//     저장 전에 아래 미리보기로 실제 모양을 확인한다 — 미리보기는 업로드와 «같은 그리기 함수»를 쓴다.
//   · 돈 로직 없음. 주문·입금·정산·배송·포인트·Bankda 와 무관.

import { useEffect, useRef, useState } from "react";
import {
  PRODUCT_IMAGE_NOTICE_DEFAULTS,
  NOTICE_TEXT_MAX,
  validateProductImageNotice,
  type ProductImageNotice,
} from "@/lib/productImageNotice";
import {
  clearProductImageNoticeCache,
  drawProductImageNotice,
} from "@/components/admin-live/quick-product/productImageNoticeClient";
import { showAdminToast } from "@/lib/adminToast";

const cardClass = "rounded-2xl border border-line bg-surface p-5";
const inputClass =
  "h-11 w-full rounded-2xl border border-line bg-surface px-4 text-sm font-bold text-ink outline-none transition focus:border-rose-deep focus:ring-4 focus:ring-rose-soft";

/** 사장님 시안에서 고른 세 단계 */
const OPACITY_CHOICES = [
  { value: 0.3, label: "30% 연하게" },
  { value: 0.45, label: "45% 보통" },
  { value: 0.6, label: "60% 진하게" },
];

const PREVIEW_W = 640;
const PREVIEW_H = 360;

function sectionTitle(title: string, desc: string) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-black text-ink">{title}</h2>
      <p className="mt-1 text-xs font-bold text-ink-mute">{desc}</p>
    </div>
  );
}

export default function ProductImageNoticeSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storedKeys, setStoredKeys] = useState(0);
  const [on, setOn] = useState(PRODUCT_IMAGE_NOTICE_DEFAULTS.on);
  const [text, setText] = useState(PRODUCT_IMAGE_NOTICE_DEFAULTS.text);
  const [opacity, setOpacity] = useState(PRODUCT_IMAGE_NOTICE_DEFAULTS.opacity);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin-live/product-image-notice", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && json?.ok && json.notice) {
          setOn(json.notice.on);
          setText(json.notice.text);
          setOpacity(json.notice.opacity);
          setStoredKeys(Number(json.storedKeys) || 0);
        } else {
          showAdminToast("상품사진 문구 설정 불러오기 실패\n\n" + (json?.error || `HTTP ${res.status}`), "error");
        }
      } catch (error) {
        if (alive) showAdminToast("상품사진 문구 설정 불러오기 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 미리보기 — 업로드할 때와 «같은 함수»로 그린다(모양이 달라질 수 없다)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = PREVIEW_W;
    canvas.height = PREVIEW_H;

    // 사진 대신 «밝은 곳 · 어두운 곳»이 섞인 배경 — 두 경우 모두 읽히는지 한눈에 본다
    const grad = ctx.createLinearGradient(0, 0, PREVIEW_W, PREVIEW_H);
    grad.addColorStop(0, "#d9dde4");
    grad.addColorStop(0.5, "#8a8f98");
    grad.addColorStop(1, "#2b2f36");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

    if (on && String(text || "").trim()) {
      drawProductImageNotice(ctx, { x: 0, y: 0, width: PREVIEW_W, height: PREVIEW_H }, { on, text, opacity });
    }
  }, [on, text, opacity]);

  const save = async () => {
    const draft: ProductImageNotice = { on, text: text.trim(), opacity };
    const message = validateProductImageNotice(draft);
    if (message) {
      showAdminToast(message, "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin-live/product-image-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        showAdminToast("상품사진 문구 저장 실패\n\n" + (json?.error || `HTTP ${res.status}`), "error");
        return;
      }
      if (json?.notice) {
        setOn(json.notice.on);
        setText(json.notice.text);
        setOpacity(json.notice.opacity);
        setStoredKeys(Number(json.storedKeys) || 0);
      }
      clearProductImageNoticeCache();   // 다음 사진 업로드부터 바로 새 값으로
      showAdminToast("저장했습니다. 지금부터 올리는 사진에 적용됩니다.", "success");
    } catch (error) {
      showAdminToast("상품사진 문구 저장 실패\n\n" + (error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {storedKeys === 0 && !loading ? (
          <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold leading-5 text-ink-soft">
            아직 한 번도 저장하지 않아 «꺼짐» 상태입니다. 켜고 저장하면 그때부터 올리는 사진에만 문구가 들어갑니다.
          </div>
        ) : null}

        <div className={cardClass}>
          {sectionTitle(
            "상품사진 안내문구",
            "사진을 올릴 때 오른쪽 아래에 검정 반투명 띠와 문구를 «사진 자체에» 그려 넣습니다. 손님 화면·방송 위젯·카톡 공유·다운로드 어디서 봐도 문구가 따라갑니다.",
          )}

          <button
            type="button"
            onClick={() => setOn(!on)}
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition ${
              on ? "border-rose-deep bg-rose-soft" : "border-line bg-surface-2 hover:opacity-90"
            }`}
          >
            <span>
              <span className={`block text-sm font-black ${on ? "text-rose-deep" : "text-ink"}`}>
                새로 올리는 사진에 문구 넣기
              </span>
              <span className="mt-1 block text-xs font-bold text-ink-mute">
                이미 올라간 사진은 바뀌지 않습니다. 켠 뒤에 올리는 사진부터 적용됩니다.
              </span>
            </span>
            <span className={`shrink-0 text-sm font-black ${on ? "text-rose-deep" : "text-ink-mute"}`}>
              {on ? "켜짐" : "꺼짐"}
            </span>
          </button>

          <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-ink">문구</span>
              <span className="text-xs font-bold text-ink-mute">{text.length} / {NOTICE_TEXT_MAX}자</span>
            </div>
            <div className="mt-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, NOTICE_TEXT_MAX))}
                placeholder={PRODUCT_IMAGE_NOTICE_DEFAULTS.text}
                className={inputClass}
              />
            </div>
            <div className="mt-2 text-xs font-bold leading-5 text-ink-mute">
              문구가 길면 사진 폭에 맞춰 글자가 자동으로 작아집니다.
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4">
            <div className="text-sm font-black text-ink">배경 진하기</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
              검정 반투명입니다. 숫자가 작을수록 뒤 사진이 많이 비칩니다.
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {OPACITY_CHOICES.map((choice) => {
                const active = Math.abs(choice.value - opacity) < 0.001;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setOpacity(choice.value)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-black transition ${
                      active ? "border-rose-deep bg-rose-soft text-rose-deep" : "border-line bg-surface text-ink-soft hover:opacity-90"
                    }`}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4">
            <div className="text-sm font-black text-ink">미리보기</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
              사진에 실제로 그려지는 것과 같은 방식입니다. 밝은 쪽·어두운 쪽 모두에서 읽히는지 봐주세요.
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-line">
              <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs font-bold text-ink-mute">
          {loading ? "불러오는 중..." : "저장 후 올리는 사진부터 적용됩니다. 이미 올라간 사진은 바뀌지 않습니다."}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="rounded-2xl bg-rose-deep px-6 py-2.5 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
        >
          {saving ? "저장중..." : "문구 설정 저장"}
        </button>
      </div>
    </div>
  );
}
