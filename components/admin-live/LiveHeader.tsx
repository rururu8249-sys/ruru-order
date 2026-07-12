"use client";

import { useMemo, useState } from "react";
import type { AdminLiveBroadcast } from "./liveBroadcastController";
import { formatBroadcastTime } from "./liveBroadcastController";

type VideoRatio = "vertical" | "wide" | "auto";

type Props = {
  videoRatio: VideoRatio;
  onVideoRatioChange: (value: VideoRatio) => void;
  activeBroadcast: AdminLiveBroadcast | null;
  savingBroadcast?: boolean;
  onStartBroadcast: (input: { title: string; youtubeUrl?: string }) => Promise<void> | void;
  onEndBroadcast: () => Promise<void> | void;
  onSaveBroadcast: (input: { title: string; youtubeUrl?: string }) => Promise<void> | void;
  title: string;
  onTitleChange: (value: string) => void;
  youtubeUrl: string;
  onYoutubeUrlChange: (value: string) => void;
  // 자리만(다음 단계 연결): 진열 상품 수
  productCount?: number;
  shopOpen?: boolean;
  onToggleShopOpen?: () => void;
  // [2026-07-12] 위젯 상품카드 ON/OFF (방송 중에만 의미. 배너는 PRISM 소스라 무관)
  widgetCardOn?: boolean;
  onToggleWidgetCard?: () => void;
};

function todayLabel() {
  return new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
}

export default function LiveHeader({
  videoRatio,
  onVideoRatioChange,
  activeBroadcast,
  savingBroadcast = false,
  onStartBroadcast,
  onEndBroadcast,
  onSaveBroadcast,
  title,
  onTitleChange,
  youtubeUrl,
  onYoutubeUrlChange,
  productCount,
  shopOpen = true,
  onToggleShopOpen,
  widgetCardOn = true,
  onToggleWidgetCard,
}: Props) {
  const [titleSavedAt, setTitleSavedAt] = useState("");
  const [urlAppliedAt, setUrlAppliedAt] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  // 방송알림: 대상(신청자/전체) 선택 + 이미 받은 사람 제외(증분) + 미리보기
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMode, setAlertMode] = useState<"optin" | "all">("optin");
  const [alertPreview, setAlertPreview] = useState<any>(null);
  const [alertPreviewLoading, setAlertPreviewLoading] = useState(false);
  const [alertSending, setAlertSending] = useState(false);
  const [alertResult, setAlertResult] = useState("");

  const loadAlertPreview = async (mode: "optin" | "all") => {
    if (!activeBroadcast) return;
    setAlertPreviewLoading(true);
    setAlertPreview(null);
    setAlertResult("");
    try {
      const r = await fetch("/api/admin-live/live-alert-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcastId: activeBroadcast.id, dryRun: true, mode }),
      }).then((res) => res.json()).catch(() => null);
      if (!r?.ok) { setAlertResult("대상 조회 실패: " + (r?.error || "권한/네트워크 확인")); return; }
      setAlertPreview(r);
    } finally {
      setAlertPreviewLoading(false);
    }
  };

  const openAlert = () => {
    if (!activeBroadcast) return;
    setAlertOpen(true);
    setAlertMode("optin");
    void loadAlertPreview("optin");
  };

  const changeAlertMode = (mode: "optin" | "all") => {
    setAlertMode(mode);
    void loadAlertPreview(mode);
  };

  const sendAlert = async () => {
    if (!activeBroadcast || alertSending) return;
    const count = Number(alertPreview?.targetCount || 0);
    if (count === 0) return;
    if (alertMode === "all") {
      if (!window.confirm(`⚠️ 신청 안 한 회원까지 ${count}명에게 발송합니다.\n동의 미확인자 발송은 카카오 채널 제재 위험이 있습니다.\n정말 보낼까요?`)) return;
    } else {
      if (!window.confirm(`${count}명에게 방송알림을 발송합니다. 계속할까요?`)) return;
    }
    setAlertSending(true);
    setAlertResult("");
    try {
      const r = await fetch("/api/admin-live/live-alert-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcastId: activeBroadcast.id, mode: alertMode }),
      }).then((res) => res.json()).catch(() => null);
      setAlertResult(r?.ok ? `✅ 발송 완료 · 성공 ${r.successCount} / 실패 ${r.failCount}` : "발송 실패: " + (r?.error || "알 수 없는 오류"));
      await loadAlertPreview(alertMode); // 발송 후 인원 갱신(이미 받은 사람 반영)
    } finally {
      setAlertSending(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (activeBroadcast) return "방송중";
    return "대기";
  }, [activeBroadcast]);

  const saveCurrentBroadcast = async () => {
    await onSaveBroadcast({ title, youtubeUrl });
    setTitleSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
  };

  const applyYoutubeUrl = async () => {
    await onSaveBroadcast({ title, youtubeUrl });
    setUrlAppliedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
  };

  return (
    <header className="mb-3 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-sm">
      {/* 상단줄: 제목 + 날짜 + 상태배지 + [＋새 방송][▶방송시작][■방송종료] */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-[18px] font-black tracking-tight text-rose-deep md:text-[20px]">방송 컨트롤타워</h1>

        <div className="hidden h-6 w-px bg-line md:block" />

        <div className="hidden text-xs font-black text-ink-soft sm:block">📅 {todayLabel()}</div>

        <div
          className={[
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black",
            statusLabel === "방송중" ? "bg-ok-bg text-ok-tx" : "bg-warn-bg text-warn-tx",
          ].join(" ")}
        >
          <span className={["h-2 w-2 rounded-full", statusLabel === "방송중" ? "bg-emerald-500" : "bg-amber-500"].join(" ")} />
          {statusLabel}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* ＋새 방송은 상품 관리 팝업 > 방송 상품 탭으로 이동(중복 제거) */}
          <button
            type="button"
            disabled={savingBroadcast || Boolean(activeBroadcast)}
            onClick={() => onStartBroadcast({ title, youtubeUrl })}
            className="h-9 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-line disabled:text-ink-mute"
          >
            ▶ 방송시작
          </button>
          <button
            type="button"
            disabled={savingBroadcast || !activeBroadcast}
            onClick={onEndBroadcast}
            className="h-9 rounded-xl bg-red-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-red-700 disabled:bg-line disabled:text-ink-mute"
          >
            ■ 방송종료
          </button>
          {activeBroadcast && (
            <button
              type="button"
              className="h-9 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-indigo-700 disabled:bg-line disabled:text-ink-mute"
              onClick={openAlert}
            >
              📣 방송알림
            </button>
          )}
        </div>
      </div>

      {/* 압축 상태바: ● 방송명 · 상품 N개 · 시작시간 + 우측 [쇼핑몰 토글][URL 수정] */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-xs font-black text-ink-soft">
        <span className={["h-2 w-2 rounded-full", statusLabel === "방송중" ? "bg-emerald-500" : "bg-amber-500"].join(" ")} />
        <span className="text-ink">{title.trim() || activeBroadcast?.public_title || "방송명 미설정"}</span>
        <span className="text-ink-mute">·</span>
        <span>상품 {typeof productCount === "number" ? productCount : "—"}개</span>
        <span className="text-ink-mute">·</span>
        <span>{activeBroadcast?.started_at ? `시작 ${formatBroadcastTime(activeBroadcast.started_at)}` : "방송시작 전"}</span>
        <span className="hidden text-ink-mute md:inline">· 주문묶음=방송 시작~종료 기준</span>

        <div className="ml-auto flex items-center gap-2">
          {/* [2026-07-12] 위젯 상품카드 ON/OFF — 방송 중에만 활성. 카드만 숨김(위젯 투명), 배너는 PRISM 소스라 무관 */}
          <button
            type="button"
            disabled={!activeBroadcast}
            onClick={() => onToggleWidgetCard?.()}
            className={[
              "h-7 rounded-lg px-2.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-40",
              widgetCardOn ? "bg-ok-bg text-ok-tx" : "bg-surface-3 text-ink-soft",
            ].join(" ")}
            title={activeBroadcast ? "방송 위젯의 상품카드를 켜고 끕니다 (위젯 반영 최대 20초)" : "방송 중에만 사용할 수 있습니다"}
          >
            🖼 위젯 상품 {widgetCardOn ? "ON" : "OFF"}
          </button>
          {/* 쇼핑몰 열기/닫기 — settings.shop_open 영속. 방송 ON 중엔 의미 없어 비활성. */}
          <button
            type="button"
            disabled={Boolean(activeBroadcast)}
            onClick={() => onToggleShopOpen?.()}
            className={[
              "h-7 rounded-lg px-2.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-40",
              shopOpen ? "bg-ok-bg text-ok-tx" : "bg-surface-3 text-ink-soft",
            ].join(" ")}
            title={activeBroadcast ? "방송 중에는 쇼핑몰 토글을 사용할 수 없습니다" : "쇼핑몰 열기/닫기"}
          >
            🛍 쇼핑몰 {shopOpen ? "열림" : "닫힘"}
          </button>
          <button
            type="button"
            onClick={() => setEditOpen((v) => !v)}
            className="h-7 rounded-lg border border-line bg-surface px-2.5 text-[11px] font-black text-ink-soft transition hover:bg-surface-2"
          >
            {editOpen ? "닫기 ▲" : "제목·URL 수정 ▼"}
          </button>
        </div>
      </div>

      {/* 인라인 편집(접힘): 평소엔 숨김. controlled 값/onChange/저장·적용 disabled 그대로 */}
      {editOpen ? (
        <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-black text-ink-soft">방송 제목</label>
              <span className="text-[10px] font-bold text-ink-mute">
                {titleSavedAt ? `저장 ${titleSavedAt}` : activeBroadcast ? "방송중" : "저장 필요"}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-line focus:ring-2 focus:ring-rose-soft"
              />
              <button
                type="button"
                disabled={savingBroadcast || !activeBroadcast}
                onClick={saveCurrentBroadcast}
                className="h-9 shrink-0 rounded-xl bg-rose-deep px-3 text-xs font-black text-white transition hover:opacity-90 disabled:bg-line disabled:text-ink-mute"
              >
                저장
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-black text-ink-soft">유튜브 라이브 URL</label>
              <span className="text-[10px] font-bold text-ink-mute">
                {urlAppliedAt ? `적용 ${urlAppliedAt}` : "영상/채팅 연결"}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                value={youtubeUrl}
                onChange={(event) => onYoutubeUrlChange(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-rose-line focus:ring-2 focus:ring-rose-soft"
              />
              <button
                type="button"
                disabled={savingBroadcast || !activeBroadcast}
                onClick={applyYoutubeUrl}
                className="h-9 shrink-0 rounded-xl bg-rose-deep px-3 text-xs font-black text-white transition hover:opacity-90 disabled:bg-line disabled:text-ink-mute"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 방송알림 발송 모달: 대상(신청자/전체) 선택 + 이미 받은 사람 제외(증분) + 미리보기 */}
      {alertOpen && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !alertSending && setAlertOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[15px] font-black text-ink">📣 방송알림 발송</div>
              <button
                type="button"
                onClick={() => !alertSending && setAlertOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-black text-ink-mute hover:bg-surface-2"
              >
                ✕
              </button>
            </div>

            {/* 대상 선택 */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => changeAlertMode("optin")}
                className={[
                  "h-10 rounded-xl text-sm font-black transition",
                  alertMode === "optin" ? "bg-indigo-600 text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2",
                ].join(" ")}
              >
                알림 신청자만
              </button>
              <button
                type="button"
                onClick={() => changeAlertMode("all")}
                className={[
                  "h-10 rounded-xl text-sm font-black transition",
                  alertMode === "all" ? "bg-red-600 text-white" : "border border-line bg-surface text-ink-soft hover:bg-surface-2",
                ].join(" ")}
              >
                전체 회원 ⚠️
              </button>
            </div>

            {alertMode === "all" && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
                ⚠️ 신청 안 한 회원에게도 발송합니다. 동의 미확인자 발송은 카카오 알림톡 채널이 제재/차단될 수 있어요.
              </div>
            )}

            {/* 미리보기 */}
            <div className="mb-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] font-bold text-ink">
              {alertPreviewLoading ? (
                <div className="text-ink-mute">대상 계산 중…</div>
              ) : alertPreview ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>후보 <b className="text-ink">{alertPreview.candidateCount}</b>명</span>
                  <span className="text-ink-mute">·</span>
                  <span>이미 받음 <b className="text-ink">{alertPreview.receivedCount}</b>명</span>
                  <span className="text-ink-mute">·</span>
                  <span className="text-indigo-700">이번에 받을 <b>{alertPreview.targetCount}</b>명</span>
                </div>
              ) : (
                <div className="text-ink-mute">{alertResult || "대상 없음"}</div>
              )}
            </div>

            {/* 이번에 받을 사람 목록(샘플) */}
            {alertPreview?.sample?.length ? (
              <div className="mb-3 max-h-40 overflow-auto rounded-xl border border-line">
                <div className="sticky top-0 bg-surface-2 px-3 py-1.5 text-[11px] font-black text-ink-soft">
                  이번에 받을 사람 (최대 100명 표시)
                </div>
                <ul className="divide-y divide-line">
                  {alertPreview.sample.map((s: any, i: number) => (
                    <li key={i} className="flex items-center justify-between px-3 py-1.5 text-[12px] font-bold text-ink">
                      <span>{s.name || "(이름없음)"}</span>
                      <span className="text-ink-mute">{s.phone}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {alertResult && !alertPreviewLoading && (
              <div className="mb-3 text-[13px] font-black text-ink">{alertResult}</div>
            )}

            {/* 발송 버튼 */}
            <button
              type="button"
              disabled={alertSending || alertPreviewLoading || !alertPreview || Number(alertPreview?.targetCount || 0) === 0}
              onClick={sendAlert}
              className={[
                "h-11 w-full rounded-xl text-sm font-black text-white transition disabled:bg-line disabled:text-ink-mute",
                alertMode === "all" ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700",
              ].join(" ")}
            >
              {alertSending
                ? "발송 중…"
                : Number(alertPreview?.targetCount || 0) > 0
                  ? `${alertPreview.targetCount}명에게 발송`
                  : "받을 사람 없음"}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
